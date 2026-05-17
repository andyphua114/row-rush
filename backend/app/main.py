import asyncio
import json
import os
import time
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .game import PLAYER_BROADCAST_SECONDS, TICK_SECONDS, game

app = FastAPI(title="Row Rush")

allowed_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allowed_origins == "*" else [o.strip() for o in allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionHub:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self.lock:
            self.clients[websocket] = {"role": "unknown", "player_id": None}

    async def identify(self, websocket: WebSocket, role: str, player_id: str | None = None) -> None:
        async with self.lock:
            if websocket in self.clients:
                self.clients[websocket] = {"role": role, "player_id": player_id}

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            info = self.clients.pop(websocket, None)
        if info and info.get("role") == "player":
            async with game.lock:
                game.disconnect_player(info.get("player_id"))

    async def snapshot_clients(self) -> list[tuple[WebSocket, dict[str, Any]]]:
        async with self.lock:
            return list(self.clients.items())

    async def send_json_safe(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await websocket.send_json(payload)
        except Exception:
            await self.disconnect(websocket)


hub = ConnectionHub()


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(broadcast_loop())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    player_id: str | None = None
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            msg_type = message.get("type")
            async with game.lock:
                if msg_type == "identify":
                    role = message.get("role", "player")
                    player_id = message.get("player_id")
                    await hub.identify(websocket, role, player_id)
                elif msg_type == "join":
                    player = game.upsert_player(message.get("nickname", "Rower"), message.get("player_id"))
                    player_id = player.player_id
                    await hub.identify(websocket, "player", player_id)
                    await websocket.send_json({"type": "joined", "player_id": player_id})
                elif msg_type == "select_boat":
                    ok, text = game.select_boat(player_id or message.get("player_id"), message.get("boat_id", ""))
                    await websocket.send_json({"type": "selection_result", "ok": ok, "message": text})
                elif msg_type == "tap_update":
                    game.record_taps(player_id or message.get("player_id"), message)
                elif msg_type == "admin_open_boat_selection":
                    game.open_boat_selection()
                elif msg_type == "admin_start_race":
                    if game.can_start_race() and not game.race_task:
                        game.race_task = asyncio.create_task(run_race())
                elif msg_type == "admin_next_round":
                    game.advance_after_results()
                elif msg_type == "admin_show_leaderboard":
                    game.show_round_leaderboard()
                elif msg_type == "admin_show_round_results":
                    game.show_round_results()
                elif msg_type == "admin_reset_game":
                    if game.race_task:
                        game.race_task.cancel()
                        game.race_task = None
                    game.reset()
                else:
                    await websocket.send_json({"type": "error", "message": f"Unknown message type: {msg_type}"})
    except WebSocketDisconnect:
        await hub.disconnect(websocket)


async def run_race() -> None:
    try:
        async with game.lock:
            game.phase = "COUNTDOWN"
            game.prepare_round()
        for value in [3, 2, 1, "ROW!"]:
            async with game.lock:
                game.countdown_value = value
            await asyncio.sleep(1)
        async with game.lock:
            game.phase = "RACING"
            game.countdown_value = None
            game.round_started_at = time.monotonic()
        while True:
            async with game.lock:
                game.tick_race()
                done = game.phase != "RACING"
            if done:
                break
            await asyncio.sleep(TICK_SECONDS)
    except asyncio.CancelledError:
        pass
    finally:
        async with game.lock:
            game.race_task = None


async def broadcast_loop() -> None:
    tick = 0
    while True:
        await asyncio.sleep(TICK_SECONDS)
        tick += 1
        clients = await hub.snapshot_clients()
        async with game.lock:
            admin_payload = game.admin_state()
            race_payload = game.race_state()
            player_payloads = {
                info.get("player_id"): game.player_state(info.get("player_id"))
                for _, info in clients
                if info.get("role") == "player"
            }
        for websocket, info in clients:
            role = info.get("role")
            if role == "admin":
                await hub.send_json_safe(websocket, admin_payload)
            elif role == "projector":
                await hub.send_json_safe(websocket, race_payload)
            elif role == "player" and tick % max(1, int(PLAYER_BROADCAST_SECONDS / TICK_SECONDS)) == 0:
                await hub.send_json_safe(websocket, player_payloads.get(info.get("player_id"), {}))
