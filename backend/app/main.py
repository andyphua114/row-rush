import asyncio
import hmac
import json
import os
import random
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .game import PLAYER_BROADCAST_SECONDS, TICK_SECONDS, GameState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="Row Rush")

ROOM_ADMIN_MESSAGE_TYPES = {
    "admin_open_boat_selection",
    "admin_start_race",
    "admin_next_round",
    "admin_show_leaderboard",
    "admin_show_round_results",
    "admin_reset_game",
    "admin_end_room",
}

GLOBAL_ADMIN_MESSAGE_TYPES = {
    "global_reset_room",
    "global_destroy_room",
}

ROOM_WORDS = [
    "river",
    "rapid",
    "paddle",
    "anchor",
    "oar",
    "wake",
    "sprint",
    "drift",
    "harbor",
    "tide",
    "current",
    "finish",
]

MAX_TOTAL_PLAYERS = int(os.getenv("MAX_TOTAL_PLAYERS", "100"))
EMPTY_ROOM_TTL_SECONDS = int(os.getenv("EMPTY_ROOM_TTL_SECONDS", "300"))
FINAL_RESULTS_TTL_SECONDS = int(os.getenv("FINAL_RESULTS_TTL_SECONDS", "600"))

allowed_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"]
    if allowed_origins == "*"
    else [o.strip() for o in allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RoomCreateRequest(BaseModel):
    room_name: str = Field(default="Row Rush Room", max_length=48)
    max_players: int = Field(ge=1)
    admin_password: str = Field(min_length=4, max_length=80)


@dataclass
class Room:
    room_id: str
    name: str
    max_players: int
    admin_password: str
    created_at: float = field(default_factory=time.monotonic)
    last_activity_at: float = field(default_factory=time.monotonic)
    empty_since: float | None = field(default_factory=time.monotonic)
    final_results_since: float | None = None
    game: GameState = field(default_factory=GameState)

    def touch(self) -> None:
        self.last_activity_at = time.monotonic()

    def public_summary(self, connected_clients: int = 0) -> dict[str, Any]:
        return {
            "room_id": self.room_id,
            "name": self.name,
            "max_players": self.max_players,
            "total_players": len(self.game.players),
            "connected_players": sum(1 for p in self.game.players.values() if p.connected),
            "connected_clients": connected_clients,
            "phase": self.game.phase,
            "round": self.game.round,
            "created_at": self.created_at,
            "last_activity_at": self.last_activity_at,
            "empty_since": self.empty_since,
            "final_results_since": self.final_results_since,
        }


class RoomRegistry:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self.lock = asyncio.Lock()

    async def create_room(
        self, room_name: str, max_players: int, admin_password: str
    ) -> Room:
        clean_name = (room_name or "Row Rush Room").strip()[:48] or "Row Rush Room"
        clean_password = admin_password.strip()
        if len(clean_password) < 4:
            raise HTTPException(
                status_code=400,
                detail="Room admin password must be at least 4 characters.",
            )
        async with self.lock:
            available = self.available_capacity_locked()
            if max_players > available:
                raise HTTPException(
                    status_code=400,
                    detail=f"Only {available} player slot(s) are available right now.",
                )
            room_id = self.new_room_id_locked()
            room = Room(
                room_id=room_id,
                name=clean_name,
                max_players=max_players,
                admin_password=clean_password,
            )
            self.rooms[room_id] = room
            return room

    def new_room_id_locked(self) -> str:
        while True:
            left = secrets.choice(ROOM_WORDS)
            right = secrets.choice(ROOM_WORDS)
            suffix = random.randint(100, 999)
            room_id = f"{left}-{right}-{suffix}"
            if room_id not in self.rooms:
                return room_id

    def reserved_capacity_locked(self) -> int:
        return sum(room.max_players for room in self.rooms.values())

    def available_capacity_locked(self) -> int:
        return max(0, MAX_TOTAL_PLAYERS - self.reserved_capacity_locked())

    async def capacity(self) -> dict[str, int]:
        async with self.lock:
            reserved = self.reserved_capacity_locked()
            return {
                "max_total_players": MAX_TOTAL_PLAYERS,
                "reserved_players": reserved,
                "available_players": max(0, MAX_TOTAL_PLAYERS - reserved),
                "empty_room_ttl_seconds": EMPTY_ROOM_TTL_SECONDS,
                "final_results_ttl_seconds": FINAL_RESULTS_TTL_SECONDS,
            }

    async def get_room(self, room_id: str | None) -> Room | None:
        if not room_id:
            return None
        async with self.lock:
            return self.rooms.get(room_id)

    async def list_rooms(self, client_counts: dict[str, int]) -> list[dict[str, Any]]:
        async with self.lock:
            return [
                room.public_summary(client_counts.get(room.room_id, 0))
                for room in sorted(
                    self.rooms.values(),
                    key=lambda item: item.created_at,
                    reverse=True,
                )
            ]

    async def remove_room(self, room_id: str) -> Room | None:
        async with self.lock:
            room = self.rooms.pop(room_id, None)
        if room and room.game.race_task:
            room.game.race_task.cancel()
            room.game.race_task = None
        return room


class ConnectionHub:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self.lock:
            self.clients[websocket] = {
                "role": "unknown",
                "room_id": None,
                "player_id": None,
                "room_admin_authenticated": False,
                "global_admin_authenticated": False,
            }

    async def identify(
        self,
        websocket: WebSocket,
        role: str,
        room_id: str | None = None,
        player_id: str | None = None,
        room_admin_authenticated: bool = False,
        global_admin_authenticated: bool = False,
    ) -> None:
        async with self.lock:
            if websocket in self.clients:
                self.clients[websocket] = {
                    "role": role,
                    "room_id": room_id,
                    "player_id": player_id,
                    "room_admin_authenticated": room_admin_authenticated,
                    "global_admin_authenticated": global_admin_authenticated,
                }

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            info = self.clients.pop(websocket, None)
        if not info or info.get("role") != "player":
            return
        room = await registry.get_room(info.get("room_id"))
        if room:
            async with room.game.lock:
                room.game.disconnect_player(info.get("player_id"))
                room.touch()

    async def snapshot_clients(self) -> list[tuple[WebSocket, dict[str, Any]]]:
        async with self.lock:
            return list(self.clients.items())

    async def room_client_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        async with self.lock:
            for info in self.clients.values():
                room_id = info.get("room_id")
                if room_id:
                    counts[room_id] = counts.get(room_id, 0) + 1
        return counts

    async def send_json_safe(
        self, websocket: WebSocket, payload: dict[str, Any]
    ) -> None:
        try:
            await websocket.send_json(payload)
        except Exception:
            await self.disconnect(websocket)

    async def close_room(self, room_id: str, reason: str) -> None:
        async with self.lock:
            targets = [
                websocket
                for websocket, info in self.clients.items()
                if info.get("room_id") == room_id
            ]
        for websocket in targets:
            try:
                await websocket.send_json({"type": "room_closed", "message": reason})
                await websocket.close()
            except Exception:
                pass
            await self.disconnect(websocket)


registry = RoomRegistry()
hub = ConnectionHub()


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(broadcast_loop())
    asyncio.create_task(cleanup_loop())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/capacity")
async def capacity() -> dict[str, int]:
    return await registry.capacity()


@app.post("/api/rooms")
async def create_room(payload: RoomCreateRequest) -> dict[str, Any]:
    room = await registry.create_room(
        payload.room_name, payload.max_players, payload.admin_password
    )
    capacity_payload = await registry.capacity()
    return {
        "room": room.public_summary(),
        "capacity": capacity_payload,
        "links": {
            "player": f"/r/{room.room_id}",
            "projector": f"/r/{room.room_id}/projector",
            "admin": f"/r/{room.room_id}/admin",
        },
    }


def is_valid_room_admin_password(room: Room, value: str | None) -> tuple[bool, str | None]:
    if not value:
        return False, "Room admin password is required."
    if not hmac.compare_digest(value, room.admin_password):
        return False, "Invalid room admin password."
    return True, None


def is_valid_global_admin_password(value: str | None) -> tuple[bool, str | None]:
    expected = os.getenv("GLOBAL_ADMIN_PASSWORD", "") or os.getenv("ADMIN_PASSWORD", "")
    if not expected:
        return False, "Global admin password is not configured on the server."
    if not value:
        return False, "Global admin password is required."
    if not hmac.compare_digest(value, expected):
        return False, "Invalid global admin password."
    return True, None


@app.websocket("/ws/rooms/{room_id}")
async def room_websocket_endpoint(websocket: WebSocket, room_id: str) -> None:
    room = await registry.get_room(room_id)
    if not room:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Room not found."})
        await websocket.close()
        return

    await hub.connect(websocket)
    player_id: str | None = None
    room_admin_authenticated = False
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            msg_type = message.get("type")
            if msg_type in ROOM_ADMIN_MESSAGE_TYPES and not room_admin_authenticated:
                await websocket.send_json(
                    {"type": "error", "message": "Room admin authentication required."}
                )
                continue
            async with room.game.lock:
                room.touch()
                if msg_type == "identify":
                    role = message.get("role", "player")
                    player_id = message.get("player_id")
                    if role == "admin":
                        ok, error = is_valid_room_admin_password(
                            room, message.get("admin_password")
                        )
                        if not ok:
                            room_admin_authenticated = False
                            await hub.identify(websocket, "unknown", room_id)
                            await websocket.send_json(
                                {"type": "error", "message": error}
                            )
                            continue
                        room_admin_authenticated = True
                        await hub.identify(
                            websocket,
                            "admin",
                            room_id,
                            None,
                            room_admin_authenticated=True,
                        )
                        await websocket.send_json({"type": "admin_auth", "ok": True})
                    else:
                        room_admin_authenticated = False
                        await hub.identify(websocket, role, room_id, player_id)
                elif msg_type == "join":
                    existing_player_id = message.get("player_id")
                    is_existing_player = existing_player_id in room.game.players
                    if (
                        not is_existing_player
                        and len(room.game.players) >= room.max_players
                    ):
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": "This room is full. Ask the host for another room link.",
                            }
                        )
                        continue
                    room_admin_authenticated = False
                    player = room.game.upsert_player(
                        message.get("nickname", "Rower"), existing_player_id
                    )
                    player_id = player.player_id
                    await hub.identify(websocket, "player", room_id, player_id)
                    await websocket.send_json(
                        {"type": "joined", "player_id": player_id}
                    )
                elif msg_type == "select_boat":
                    ok, text = room.game.select_boat(
                        player_id or message.get("player_id"),
                        message.get("boat_id", ""),
                    )
                    await websocket.send_json(
                        {"type": "selection_result", "ok": ok, "message": text}
                    )
                elif msg_type == "tap_update":
                    room.game.record_taps(player_id or message.get("player_id"), message)
                elif msg_type == "admin_open_boat_selection":
                    room.game.open_boat_selection()
                elif msg_type == "admin_start_race":
                    if room.game.can_start_race() and not room.game.race_task:
                        room.game.race_task = asyncio.create_task(run_race(room))
                elif msg_type == "admin_next_round":
                    room.game.advance_after_results()
                elif msg_type == "admin_show_leaderboard":
                    room.game.show_round_leaderboard()
                elif msg_type == "admin_show_round_results":
                    room.game.show_round_results()
                elif msg_type == "admin_reset_game":
                    if room.game.race_task:
                        room.game.race_task.cancel()
                        room.game.race_task = None
                    room.game.reset()
                elif msg_type == "admin_end_room":
                    await registry.remove_room(room.room_id)
                    await websocket.send_json(
                        {"type": "room_closed", "message": "Room ended."}
                    )
                    await websocket.close()
                    asyncio.create_task(
                        hub.close_room(room.room_id, "This room was ended by the host.")
                    )
                    return
                else:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": f"Unknown message type: {msg_type}",
                        }
                    )
    except WebSocketDisconnect:
        await hub.disconnect(websocket)


@app.websocket("/ws/globaladmin")
async def global_admin_websocket_endpoint(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    global_admin_authenticated = False
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            msg_type = message.get("type")
            if msg_type in GLOBAL_ADMIN_MESSAGE_TYPES and not global_admin_authenticated:
                await websocket.send_json(
                    {"type": "error", "message": "Global admin authentication required."}
                )
                continue
            if msg_type == "identify":
                ok, error = is_valid_global_admin_password(
                    message.get("admin_password")
                )
                if not ok:
                    global_admin_authenticated = False
                    await hub.identify(websocket, "unknown")
                    await websocket.send_json({"type": "error", "message": error})
                    continue
                global_admin_authenticated = True
                await hub.identify(
                    websocket,
                    "global_admin",
                    global_admin_authenticated=True,
                )
                await websocket.send_json({"type": "global_admin_auth", "ok": True})
            elif msg_type == "global_reset_room":
                room = await registry.get_room(message.get("room_id"))
                if not room:
                    await websocket.send_json({"type": "error", "message": "Room not found."})
                    continue
                async with room.game.lock:
                    if room.game.race_task:
                        room.game.race_task.cancel()
                        room.game.race_task = None
                    room.game.reset()
                    room.touch()
            elif msg_type == "global_destroy_room":
                room_id = message.get("room_id")
                room = await registry.remove_room(room_id)
                if not room:
                    await websocket.send_json({"type": "error", "message": "Room not found."})
                    continue
                asyncio.create_task(
                    hub.close_room(room_id, "This room was closed by global admin.")
                )
            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
    except WebSocketDisconnect:
        await hub.disconnect(websocket)


async def run_race(room: Room) -> None:
    try:
        async with room.game.lock:
            room.game.phase = "COUNTDOWN"
            room.game.prepare_round()
            room.touch()
        for value in [3, 2, 1, "ROW!"]:
            async with room.game.lock:
                room.game.countdown_value = value
                room.touch()
            await asyncio.sleep(1)
        async with room.game.lock:
            room.game.phase = "RACING"
            room.game.countdown_value = None
            room.game.round_started_at = time.monotonic()
            room.touch()
        while True:
            async with room.game.lock:
                room.game.tick_race()
                if room.game.phase == "FINAL_RESULTS" and not room.final_results_since:
                    room.final_results_since = time.monotonic()
                done = room.game.phase != "RACING"
                room.touch()
            if done:
                break
            await asyncio.sleep(TICK_SECONDS)
    except asyncio.CancelledError:
        pass
    finally:
        async with room.game.lock:
            room.game.race_task = None


async def room_payloads(
    room: Room, clients: list[tuple[WebSocket, dict[str, Any]]]
) -> dict[str, Any]:
    async with room.game.lock:
        if room.game.phase == "FINAL_RESULTS" and not room.final_results_since:
            room.final_results_since = time.monotonic()
        if room.game.phase != "FINAL_RESULTS":
            room.final_results_since = None
        return {
            "admin": room.game.admin_state()
            | {"room_id": room.room_id, "room_name": room.name, "max_players": room.max_players},
            "race": room.game.race_state()
            | {"room_id": room.room_id, "room_name": room.name, "max_players": room.max_players},
            "players": {
                info.get("player_id"): room.game.player_state(info.get("player_id"))
                | {
                    "room_id": room.room_id,
                    "room_name": room.name,
                    "max_players": room.max_players,
                }
                for _, info in clients
                if info.get("role") == "player"
            },
        }


async def global_admin_payload() -> dict[str, Any]:
    counts = await hub.room_client_counts()
    rooms = await registry.list_rooms(counts)
    capacity_payload = await registry.capacity()
    return {
        "type": "global_admin_state",
        "rooms": rooms,
        "capacity": capacity_payload,
    }


async def broadcast_loop() -> None:
    tick = 0
    while True:
        await asyncio.sleep(TICK_SECONDS)
        tick += 1
        clients = await hub.snapshot_clients()
        by_room: dict[str, list[tuple[WebSocket, dict[str, Any]]]] = {}
        for websocket, info in clients:
            room_id = info.get("room_id")
            if room_id:
                by_room.setdefault(room_id, []).append((websocket, info))

        room_snapshots: dict[str, dict[str, Any]] = {}
        for room_id, room_clients in by_room.items():
            room = await registry.get_room(room_id)
            if room:
                room_snapshots[room_id] = await room_payloads(room, room_clients)

        global_payload = await global_admin_payload()

        for websocket, info in clients:
            role = info.get("role")
            room_id = info.get("room_id")
            if role == "global_admin" and info.get("global_admin_authenticated"):
                await hub.send_json_safe(websocket, global_payload)
                continue
            payloads = room_snapshots.get(room_id or "")
            if not payloads:
                continue
            if role == "admin" and info.get("room_admin_authenticated"):
                await hub.send_json_safe(websocket, payloads["admin"])
            elif role == "projector":
                await hub.send_json_safe(websocket, payloads["race"])
            elif (
                role == "player"
                and tick % max(1, int(PLAYER_BROADCAST_SECONDS / TICK_SECONDS)) == 0
            ):
                await hub.send_json_safe(
                    websocket, payloads["players"].get(info.get("player_id"), {})
                )


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(5)
        now = time.monotonic()
        counts = await hub.room_client_counts()
        async with registry.lock:
            rooms = list(registry.rooms.values())
        for room in rooms:
            connected_clients = counts.get(room.room_id, 0)
            async with room.game.lock:
                if connected_clients == 0:
                    if room.empty_since is None:
                        room.empty_since = now
                else:
                    room.empty_since = None

                if room.game.phase == "FINAL_RESULTS":
                    if room.final_results_since is None:
                        room.final_results_since = now
                else:
                    room.final_results_since = None

                empty_expired = (
                    room.empty_since is not None
                    and now - room.empty_since >= EMPTY_ROOM_TTL_SECONDS
                )
                final_expired = (
                    room.final_results_since is not None
                    and now - room.final_results_since >= FINAL_RESULTS_TTL_SECONDS
                )

            if empty_expired or final_expired:
                await registry.remove_room(room.room_id)
                await hub.close_room(room.room_id, "This room expired.")
