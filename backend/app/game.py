import asyncio
import math
import random
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


PHASES = [
    "LOBBY",
    "BOAT_SELECTION",
    "ADMIN_REVIEW",
    "COUNTDOWN",
    "RACING",
    "ROUND_RESULTS",
    "ROUND_LEADERBOARD",
    "FINAL_RESULTS",
]

FINISH_DISTANCE = 1000.0
RACE_SECONDS = 40.0
TICK_SECONDS = 0.1
PLAYER_BROADCAST_SECONDS = 0.2
POINTS_BY_PLACE = [10, 7, 5, 3, 1]

BOAT_THEME_POOL = [
    ("boat_1", "Crimson Kraken", "#ef4444"),
    ("boat_2", "Azure Arrow", "#0ea5e9"),
    ("boat_3", "Golden Gull", "#f59e0b"),
    ("boat_4", "Emerald Eel", "#10b981"),
    ("boat_5", "Violet Vortex", "#8b5cf6"),
]


@dataclass(frozen=True)
class Power:
    key: str
    name: str
    trait: str


POWER_POOL = [
    Power("lightweight_hull", "Lightweight Hull", "Shrugs off crowded decks."),
    Power("heavy_oars", "Heavy Oars", "Alternating strokes hit harder."),
    Power("balanced_keel", "Balanced Keel", "Loves a tidy left-right rhythm."),
    Power("sprint_start", "Sprint Start", "Launches fast from the line."),
    Power("late_surge", "Late Surge", "Finds another gear near the end."),
    Power("steady_current", "Steady Current", "Keeps momentum beautifully."),
    Power("slippery_hull", "Slippery Hull", "Slides through rough patches."),
    Power("lucky_sail", "Lucky Sail", "Catches the nicest surprises."),
    Power("team_spirit", "Team Spirit", "Big crews lift each other."),
    Power("underdog_canoe", "Underdog Canoe", "Small crews punch above their size."),
    Power("rhythm_boat", "Rhythm Boat", "Rewards clean alternation."),
    Power("chaos_boat", "Chaos Boat", "Messy strokes still help a little."),
    Power("wave_cutter", "Wave Cutter", "Cuts through whirlpools."),
    Power("turbo_rudder", "Turbo Rudder", "Forgives uneven sides."),
    Power("crowd_cruiser", "Crowd Cruiser", "Handles very large crews well."),
    Power("tiny_terror", "Tiny Terror", "Small teams get spicy acceleration."),
    Power("big_barge", "Big Barge", "Large crews gain power, slowly."),
    Power("dragon_boat", "Dragon Boat", "Occasional flashes of speed."),
    Power("calm_waters", "Calm Waters", "Events feel less dramatic."),
    Power("risky_raft", "Risky Raft", "Events swing harder both ways."),
    Power("golden_paddle", "Golden Paddle", "Top rowers lift the whole boat."),
    Power("anchor_resistant", "Anchor Resistant", "Keeps moving through bad luck."),
    Power("clean_stroke", "Clean Stroke", "Great rhythm, stern penalty for repeats."),
    Power("momentum_master", "Momentum Master", "Holds speed like a dream."),
    Power("comeback_current", "Comeback Current", "Last place gets a gentle push."),
]


@dataclass(frozen=True)
class EventDef:
    key: str
    name: str
    description: str
    duration: float
    target: str = "single"
    kind: str = "positive"
    value: float = 0.0


EVENT_POOL = [
    EventDef("tailwind", "Tailwind", "+12% speed", 4, value=0.12),
    EventDef("whirlpool", "Whirlpool", "-12% speed", 3, kind="negative", value=-0.12),
    EventDef("lucky_current", "Lucky Current", "+10% speed", 4, value=0.10),
    EventDef("seaweed_snag", "Seaweed Snag", "-10% speed", 3, kind="negative", value=-0.10),
    EventDef("dolphin_push", "Dolphin Push", "+15% speed", 2, value=0.15),
    EventDef("splash_zone", "Splash Zone", "Balance gets wobbly", 4, kind="negative"),
    EventDef("calm_patch", "Calm Patch", "Momentum improves", 4),
    EventDef("choppy_water", "Choppy Water", "Momentum gets jumpy", 4, kind="negative"),
    EventDef("golden_wave", "Golden Wave", "Last place boost", 5, target="last", value=0.08),
    EventDef("rival_wake", "Rival Wake", "Leader slowed", 3, target="first", kind="negative", value=-0.08),
    EventDef("oar_shine", "Oar Shine", "Alternating strokes sparkle", 4),
    EventDef("slippery_oar", "Slippery Oar", "Repeats lose bite", 4, kind="negative"),
    EventDef("crowd_cheer", "Crowd Cheer", "Big crews surge", 4, target="big"),
    EventDef("small_crew_focus", "Small Crew Focus", "Small crews focus", 4, target="small"),
    EventDef("misty_river", "Misty River", "Fog rolls over the course", 4, target="all", value=0.0),
    EventDef("banana_peel", "Banana Peel", "-8% speed", 2, kind="negative", value=-0.08),
    EventDef("power_stroke", "Power Stroke", "More power per stroke", 4),
    EventDef("heavy_splash", "Heavy Splash", "Crowding hurts more", 3, kind="negative"),
    EventDef("smooth_water", "Smooth Water", "Balance floor rises", 4),
    EventDef("rogue_ripple", "Rogue Ripple", "Everyone slows a little", 3, target="all", kind="negative", value=-0.05),
    EventDef("festival_drums", "Festival Drums", "Everyone rows harder", 5, target="all", value=0.05),
    EventDef("secret_shortcut", "Secret Shortcut", "A chaser finds clean water", 3, target="nonleading", value=0.12),
    EventDef("anchor_drag", "Anchor Drag", "Acceleration dips", 3, kind="negative"),
    EventDef("river_blessing", "River Blessing", "Bad luck slides away", 5),
    EventDef("wild_current", "Wild Current", "A strange current appears", 4, kind="mixed"),
    EventDef("photo_finish", "Photo Finish Energy", "Final sprint for everyone", 5, target="all", value=0.08),
    EventDef("crowd_roar", "Crowd Roar", "Most crowded boat surges", 3, target="most_rowers"),
    EventDef("quiet_focus", "Quiet Focus", "Smallest crew surges", 3, target="fewest_rowers"),
    EventDef("paddle_sync", "Paddle Sync", "Balance bonus grows", 4),
    EventDef("wobbly_wake", "Wobbly Wake", "Balance bonus shrinks", 4, kind="negative"),
]


@dataclass
class Player:
    player_id: str
    nickname: str
    score: int = 0
    selected_boat: str | None = None
    connected: bool = True
    rounds_played: int = 0
    total_left_taps: int = 0
    total_right_taps: int = 0
    total_alternating_taps: int = 0
    total_repeated_taps: int = 0
    round_stats: dict[str, float] = field(default_factory=dict)
    last_round_result: dict[str, Any] = field(default_factory=dict)


@dataclass
class Boat:
    boat_id: str
    name: str
    color: str
    power: Power
    position: float = 0.0
    speed: float = 0.0
    finish_time: float | None = None
    rank: int = 1
    active_events: list[dict[str, Any]] = field(default_factory=list)


class GameState:
    def __init__(self) -> None:
        self.phase = "LOBBY"
        self.round = 1
        self.players: dict[str, Player] = {}
        self.boats: dict[str, Boat] = {}
        self.boat_capacity = 0
        self.selection_player_count = 0
        self.countdown_value: str | int | None = None
        self.round_started_at: float | None = None
        self.time_remaining = RACE_SECONDS
        self.tap_windows: dict[str, deque[tuple[float, dict[str, int]]]] = defaultdict(deque)
        self.last_negative_target: str | None = None
        self.event_log: deque[dict[str, Any]] = deque(maxlen=8)
        self.round_results: list[dict[str, Any]] = []
        self.final_leaderboard: list[dict[str, Any]] = []
        self.lock = asyncio.Lock()
        self.race_task: asyncio.Task | None = None
        self.reset()

    def reset(self) -> None:
        self.phase = "LOBBY"
        self.round = 1
        self.players = {}
        self.boats = self._new_boats()
        self.boat_capacity = 0
        self.selection_player_count = 0
        self.countdown_value = None
        self.round_started_at = None
        self.time_remaining = RACE_SECONDS
        self.tap_windows = defaultdict(deque)
        self.last_negative_target = None
        self.event_log = deque(maxlen=8)
        self.round_results = []
        self.final_leaderboard = []

    def _new_boats(self) -> dict[str, Boat]:
        powers = random.sample(POWER_POOL, 5)
        return {
            boat_id: Boat(boat_id=boat_id, name=name, color=color, power=powers[index])
            for index, (boat_id, name, color) in enumerate(BOAT_THEME_POOL)
        }

    def upsert_player(self, nickname: str, player_id: str | None = None) -> Player:
        pid = player_id or str(uuid.uuid4())
        if pid in self.players:
            player = self.players[pid]
            player.nickname = nickname or player.nickname
            player.connected = True
            return player
        player = Player(player_id=pid, nickname=nickname[:24])
        self.players[pid] = player
        return player

    def disconnect_player(self, player_id: str | None) -> None:
        if player_id and player_id in self.players:
            self.players[player_id].connected = False

    def open_boat_selection(self) -> None:
        if self.phase != "LOBBY":
            return
        if self.round > 3:
            self.phase = "FINAL_RESULTS"
            self._build_final_leaderboard()
            return
        self.boats = self._new_boats()
        self.tap_windows = defaultdict(deque)
        self.round_results = []
        self.event_log.clear()
        self.selection_player_count = len(self.players)
        self.boat_capacity = max(1, math.ceil(max(1, self.selection_player_count) * 0.30))
        for player in self.players.values():
            player.selected_boat = None
            player.round_stats = self._empty_stats()
            player.last_round_result = {}
        self.phase = "BOAT_SELECTION"

    def select_boat(self, player_id: str, boat_id: str) -> tuple[bool, str]:
        if self.phase not in {"BOAT_SELECTION", "ADMIN_REVIEW"}:
            return False, "Boat selection is closed."
        if boat_id not in self.boats:
            return False, "Unknown boat."
        player = self.players.get(player_id)
        if not player:
            return False, "Join first."
        current = player.selected_boat
        if current == boat_id:
            return True, "Already selected."
        counts = self.boat_counts()
        if counts[boat_id] >= self.boat_capacity:
            return False, "Boat full, choose another."
        player.selected_boat = boat_id
        self.phase = "ADMIN_REVIEW"
        return True, "Boat selected."

    def can_start_race(self) -> bool:
        return self.phase in {"BOAT_SELECTION", "ADMIN_REVIEW"} and any(
            p.selected_boat for p in self.players.values()
        )

    def prepare_round(self) -> None:
        self.countdown_value = 3
        self.time_remaining = RACE_SECONDS
        self.round_started_at = None
        self.tap_windows = defaultdict(deque)
        self.event_log.clear()
        self.last_negative_target = None
        for boat in self.boats.values():
            boat.position = 0
            boat.speed = 0
            boat.finish_time = None
            boat.rank = 1
            boat.active_events = []
        for player in self.players.values():
            player.round_stats = self._empty_stats()
            player.last_round_result = {}

    def record_taps(self, player_id: str, message: dict[str, Any]) -> None:
        if self.phase != "RACING":
            return
        player = self.players.get(player_id)
        if not player or not player.selected_boat:
            return
        if int(message.get("round", self.round)) != self.round:
            return
        if message.get("boat_id") and message.get("boat_id") != player.selected_boat:
            return
        stats = {
            "left_taps": max(0, int(message.get("left_taps", 0))),
            "right_taps": max(0, int(message.get("right_taps", 0))),
            "alternating_taps": max(0, int(message.get("alternating_taps", 0))),
            "repeated_taps": max(0, int(message.get("repeated_taps", 0))),
        }
        if sum(stats.values()) <= 0:
            return
        now = time.monotonic()
        self.tap_windows[player.selected_boat].append((now, stats))
        round_stats = player.round_stats or self._empty_stats()
        for key, value in stats.items():
            round_stats[key] = round_stats.get(key, 0) + value
        round_stats["contribution_power"] = (
            round_stats.get("alternating_taps", 0) + round_stats.get("repeated_taps", 0) * 0.25
        )
        player.round_stats = round_stats
        player.total_left_taps += stats["left_taps"]
        player.total_right_taps += stats["right_taps"]
        player.total_alternating_taps += stats["alternating_taps"]
        player.total_repeated_taps += stats["repeated_taps"]

    def show_round_leaderboard(self) -> None:
        if self.phase == "ROUND_RESULTS":
            self._build_final_leaderboard()
            self.phase = "ROUND_LEADERBOARD"

    def show_round_results(self) -> None:
        if self.phase == "ROUND_LEADERBOARD":
            self.phase = "ROUND_RESULTS"

    def advance_after_results(self) -> None:
        if self.phase not in {"ROUND_RESULTS", "ROUND_LEADERBOARD"}:
            return
        self.round += 1
        if self.round > 3:
            self.phase = "FINAL_RESULTS"
            self._build_final_leaderboard()
        else:
            self.phase = "LOBBY"
            for player in self.players.values():
                player.selected_boat = None

    def tick_race(self) -> None:
        if self.phase != "RACING" or self.round_started_at is None:
            return
        elapsed = time.monotonic() - self.round_started_at
        self.time_remaining = max(0, RACE_SECONDS - elapsed)
        self._expire_taps_and_events()
        self._maybe_trigger_event(elapsed)
        ranks = self._current_ranks()
        for boat in self.boats.values():
            boat.rank = ranks[boat.boat_id]
            stats = self._sum_recent_taps(boat.boat_id)
            rower_count = self.boat_counts()[boat.boat_id]
            calculated = self._calculate_speed(boat, stats, rower_count, elapsed)
            boat.speed = self._smooth_speed(boat, calculated)
            boat.position = min(FINISH_DISTANCE, boat.position + boat.speed * TICK_SECONDS)
            if boat.finish_time is None and boat.position >= FINISH_DISTANCE:
                boat.finish_time = elapsed
        if elapsed >= RACE_SECONDS:
            self.finish_round()

    def finish_round(self) -> None:
        self.phase = "ROUND_RESULTS"
        self.time_remaining = 0
        self._rank_final_boats()
        points_by_boat = {
            boat.boat_id: POINTS_BY_PLACE[max(0, min(4, boat.rank - 1))]
            for boat in self.boats.values()
        }
        average_power_by_boat = self._average_power_by_boat()
        for player in self.players.values():
            if not player.selected_boat:
                continue
            placement_points = points_by_boat.get(player.selected_boat, 0)
            bonus = self._individual_round_bonus(
                player.round_stats,
                average_power_by_boat.get(player.selected_boat, 0),
            )
            points = placement_points + bonus["total_bonus"]
            player.score += points
            player.rounds_played += 1
            boat = self.boats[player.selected_boat]
            player.last_round_result = {
                "round": self.round,
                "boat_id": boat.boat_id,
                "boat_name": boat.name,
                "placement": boat.rank,
                "points": points,
                "placement_points": placement_points,
                "accuracy_bonus": bonus["accuracy_bonus"],
                "contribution_bonus": bonus["contribution_bonus"],
                "accuracy_rate": bonus["accuracy_rate"],
                "total_score": player.score,
                "contribution": player.round_stats,
            }
        self.round_results = self._round_scoreboard()
        self._build_final_leaderboard()

    def public_boats(self, reveal_traits: bool = False, include_counts: bool = False) -> list[dict[str, Any]]:
        counts = self.boat_counts()
        return [
            {
                "boat_id": boat.boat_id,
                "name": boat.name,
                "color": boat.color,
                "power_name": boat.power.name if reveal_traits else None,
                "power_trait": boat.power.trait if reveal_traits else None,
                "rower_count": counts[boat.boat_id] if include_counts else None,
            }
            for boat in self.boats.values()
        ]

    def race_state(self) -> dict[str, Any]:
        include_counts = self.phase in {"RACING", "ROUND_RESULTS", "ROUND_LEADERBOARD", "FINAL_RESULTS"}
        reveal = self.phase in {"RACING", "ROUND_RESULTS", "ROUND_LEADERBOARD", "FINAL_RESULTS"}
        return {
            "type": "race_state",
            "phase": self.phase,
            "round": self.round,
            "time_remaining": self.time_remaining,
            "countdown": self.countdown_value,
            "boats": [
                {
                    **boat_data,
                    "position": round(self.boats[boat_data["boat_id"]].position, 2),
                    "speed": round(self.boats[boat_data["boat_id"]].speed, 2),
                    "rank": self.boats[boat_data["boat_id"]].rank,
                    "finish_time": self.boats[boat_data["boat_id"]].finish_time,
                    **self._event_summary(self.boats[boat_data["boat_id"]]),
                }
                for boat_data in self.public_boats(reveal, include_counts)
            ],
            "events": list(self.event_log),
            "round_results": self.round_results,
            "final_leaderboard": self.final_leaderboard,
        }

    def admin_state(self) -> dict[str, Any]:
        return {
            "type": "admin_state",
            "phase": self.phase,
            "round": self.round,
            "total_players": len(self.players),
            "connected_players": sum(1 for p in self.players.values() if p.connected),
            "boat_capacity": self.boat_capacity,
            "boat_counts": self.boat_counts(),
            "boats": self.public_boats(True, True),
            "time_remaining": self.time_remaining,
            "countdown": self.countdown_value,
            "round_results": self.round_results,
            "final_leaderboard": self.final_leaderboard,
        }

    def player_state(self, player_id: str | None) -> dict[str, Any]:
        player = self.players.get(player_id or "")
        selected_boat = self.boats.get(player.selected_boat) if player and player.selected_boat else None
        final_rank = None
        if player and self.final_leaderboard:
            for index, row in enumerate(self.final_leaderboard, start=1):
                if row["player_id"] == player.player_id:
                    final_rank = index
                    break
        return {
            "type": "player_state",
            "phase": self.phase,
            "round": self.round,
            "time_remaining": self.time_remaining,
            "countdown": self.countdown_value,
            "player_id": player.player_id if player else player_id,
            "nickname": player.nickname if player else "",
            "selected_boat": player.selected_boat if player else None,
            "selected_boat_name": selected_boat.name if selected_boat else None,
            "selected_boat_color": selected_boat.color if selected_boat else None,
            "score": player.score if player else 0,
            "round_contribution": player.round_stats if player else self._empty_stats(),
            "last_round_result": player.last_round_result if player else {},
            "final_rank": final_rank,
            "boats": self.public_boats(False, False),
            "race_boat": self._player_boat_snapshot(selected_boat) if selected_boat else None,
            "final_leaderboard": self.final_leaderboard[:10],
        }

    def boat_counts(self) -> dict[str, int]:
        counts = {boat_id: 0 for boat_id in self.boats.keys()}
        for player in self.players.values():
            if player.selected_boat in counts:
                counts[player.selected_boat] += 1
        return counts

    def _average_power_by_boat(self) -> dict[str, float]:
        powers: dict[str, list[float]] = {boat_id: [] for boat_id in self.boats.keys()}
        for player in self.players.values():
            if player.selected_boat in powers:
                powers[player.selected_boat].append(player.round_stats.get("contribution_power", 0))
        return {
            boat_id: (sum(values) / len(values) if values else 0)
            for boat_id, values in powers.items()
        }

    def _individual_round_bonus(self, stats: dict[str, float], boat_average_power: float) -> dict[str, Any]:
        alternating = stats.get("alternating_taps", 0)
        repeated = stats.get("repeated_taps", 0)
        contribution_power = stats.get("contribution_power", 0)
        accuracy_rate = alternating / max(alternating + repeated, 1)

        if contribution_power <= 0 or boat_average_power <= 0:
            contribution_bonus = 0
        elif contribution_power >= boat_average_power * 1.25:
            contribution_bonus = 3
        elif contribution_power >= boat_average_power:
            contribution_bonus = 2
        elif contribution_power >= boat_average_power * 0.60:
            contribution_bonus = 1
        else:
            contribution_bonus = 0

        if alternating + repeated < 6:
            accuracy_bonus = 0
        elif accuracy_rate >= 0.85:
            accuracy_bonus = 2
        elif accuracy_rate >= 0.65:
            accuracy_bonus = 1
        else:
            accuracy_bonus = 0

        return {
            "contribution_bonus": contribution_bonus,
            "accuracy_bonus": accuracy_bonus,
            "total_bonus": contribution_bonus + accuracy_bonus,
            "accuracy_rate": round(accuracy_rate, 3),
        }

    def _player_boat_snapshot(self, boat: Boat | None) -> dict[str, Any] | None:
        if not boat:
            return None
        return {
            "boat_id": boat.boat_id,
            "name": boat.name,
            "color": boat.color,
            "power_name": boat.power.name,
            "power_trait": boat.power.trait,
            "position": boat.position,
            "speed": boat.speed,
            "rank": boat.rank,
            "progress": min(100, boat.position / FINISH_DISTANCE * 100),
            **self._event_summary(boat),
        }

    def _empty_stats(self) -> dict[str, float]:
        return {
            "left_taps": 0,
            "right_taps": 0,
            "alternating_taps": 0,
            "repeated_taps": 0,
            "contribution_power": 0,
        }

    def _expire_taps_and_events(self) -> None:
        now = time.monotonic()
        for window in self.tap_windows.values():
            while window and now - window[0][0] > 1.0:
                window.popleft()
        for boat in self.boats.values():
            boat.active_events = [event for event in boat.active_events if event["ends_at"] > now]

    def _sum_recent_taps(self, boat_id: str) -> dict[str, int]:
        totals = {"left_taps": 0, "right_taps": 0, "alternating_taps": 0, "repeated_taps": 0}
        for _, stats in self.tap_windows[boat_id]:
            for key in totals:
                totals[key] += int(stats.get(key, 0))
        return totals

    def _calculate_speed(self, boat: Boat, stats: dict[str, int], rower_count: int, elapsed: float) -> float:
        repeated_weight = 0.25
        alternating_mult = 1.0
        balance_mult = 1.0
        weight_penalty_mult = 1.0
        speed_mult = 1.0
        smoothing_note = 0.0
        total_taps = stats["left_taps"] + stats["right_taps"]
        for event in boat.active_events:
            key = event["key"]
            value = event.get("value", 0.0)
            if key in {"tailwind", "lucky_current", "dolphin_push", "golden_wave", "rival_wake", "banana_peel", "rogue_ripple", "festival_drums", "secret_shortcut", "photo_finish", "wild_current"}:
                speed_mult *= 1 + value
            elif key == "splash_zone":
                balance_mult *= 0.8
            elif key == "oar_shine":
                alternating_mult *= 1.10
            elif key == "slippery_oar":
                repeated_weight = min(repeated_weight, 0.15)
            elif key == "power_stroke":
                speed_mult *= 1.10
            elif key == "heavy_splash":
                weight_penalty_mult *= 1.10
            elif key == "smooth_water":
                balance_mult *= 1.12
            elif key == "crowd_cheer" and rower_count > 15:
                speed_mult *= 1.08
            elif key == "small_crew_focus" and rower_count < 8:
                speed_mult *= 1.10
            elif key == "crowd_roar":
                speed_mult *= 1.08
            elif key == "quiet_focus":
                speed_mult *= 1.08
            elif key == "paddle_sync":
                balance_mult *= 1.12
            elif key == "wobbly_wake":
                balance_mult *= 0.88
            elif key in {"calm_patch", "choppy_water", "anchor_drag", "river_blessing", "misty_river"}:
                smoothing_note += 0.0

        p = boat.power.key
        if p == "lightweight_hull":
            weight_penalty_mult *= 0.85
        elif p == "heavy_oars":
            alternating_mult *= 1.10
            repeated_weight *= 0.90
        elif p == "balanced_keel":
            balance_mult *= 1.12
        elif p == "sprint_start" and elapsed < 8:
            speed_mult *= 1.20
        elif p == "late_surge" and elapsed > 30:
            speed_mult *= 1.25
        elif p == "slippery_hull":
            speed_mult *= self._negative_event_relief(boat, 0.30)
        elif p == "lucky_sail":
            speed_mult *= self._positive_event_boost(boat, 0.20)
        elif p == "team_spirit" and rower_count > 15:
            speed_mult *= 1.10
        elif p == "underdog_canoe" and rower_count < 8:
            speed_mult *= 1.20
        elif p == "rhythm_boat":
            alternating_mult *= 1.15
        elif p == "chaos_boat":
            repeated_weight = max(repeated_weight, 0.35)
        elif p == "wave_cutter":
            speed_mult *= self._specific_event_relief(boat, "whirlpool", 0.35)
        elif p == "turbo_rudder":
            balance_mult *= 1.10
        elif p == "crowd_cruiser" and rower_count > 20:
            weight_penalty_mult *= 0.88
        elif p == "tiny_terror" and rower_count < 8:
            speed_mult *= 1.25
        elif p == "big_barge" and rower_count > 15:
            speed_mult *= 1.08
            weight_penalty_mult *= 0.94
        elif p == "dragon_boat" and int(elapsed) % 11 == 0:
            speed_mult *= 1.10
        elif p == "calm_waters":
            speed_mult = 1 + (speed_mult - 1) * 0.75
        elif p == "risky_raft":
            speed_mult = 1 + (speed_mult - 1) * 1.25
        elif p == "golden_paddle":
            speed_mult *= 1 + min(0.06, stats["alternating_taps"] / 1000)
        elif p == "anchor_resistant":
            speed_mult = max(speed_mult, 0.90)
        elif p == "clean_stroke":
            alternating_mult *= 1.16
            repeated_weight *= 0.70
        elif p == "comeback_current" and boat.rank == 5:
            speed_mult *= 1.08

        valid_power = stats["alternating_taps"] * alternating_mult + stats["repeated_taps"] * repeated_weight
        balance = 1 - abs(stats["left_taps"] - stats["right_taps"]) / max(total_taps, 1)
        balance = max(0, min(1, balance * balance_mult))
        crowd_penalty = 1 + rower_count * 0.08 * weight_penalty_mult
        speed = math.sqrt(max(0, valid_power)) * (0.7 + 0.5 * balance) / crowd_penalty
        return speed * speed_mult * 4.5

    def _smooth_speed(self, boat: Boat, calculated: float) -> float:
        previous = 0.85
        current = 0.15
        if boat.power.key in {"steady_current", "momentum_master"}:
            previous, current = 0.90, 0.10
        if boat.power.key == "big_barge":
            previous, current = 0.92, 0.08
        for event in boat.active_events:
            if event["key"] == "calm_patch":
                previous, current = max(previous, 0.90), min(current, 0.10)
            elif event["key"] in {"choppy_water", "anchor_drag"}:
                previous, current = 0.75, 0.25
        return boat.speed * previous + calculated * current

    def _negative_event_relief(self, boat: Boat, relief: float) -> float:
        mult = 1.0
        for event in boat.active_events:
            if event.get("kind") == "negative" and event.get("value", 0) < 0:
                mult *= 1 - event["value"] * relief
        return mult

    def _positive_event_boost(self, boat: Boat, boost: float) -> float:
        mult = 1.0
        for event in boat.active_events:
            if event.get("kind") == "positive" and event.get("value", 0) > 0:
                mult *= 1 + event["value"] * boost
        return mult

    def _specific_event_relief(self, boat: Boat, key: str, relief: float) -> float:
        for event in boat.active_events:
            if event["key"] == key and event.get("value", 0) < 0:
                return 1 - event["value"] * relief
        return 1.0

    def _maybe_trigger_event(self, elapsed: float) -> None:
        active_count = sum(len(b.active_events) for b in self.boats.values())
        desired_events = 7
        chance = desired_events / (RACE_SECONDS / TICK_SECONDS)
        if elapsed > 35 and not any(e["key"] == "photo_finish" for b in self.boats.values() for e in b.active_events):
            self._apply_event(next(e for e in EVENT_POOL if e.key == "photo_finish"))
            return
        if active_count >= 4 or random.random() > chance:
            return
        self._apply_event(random.choice(EVENT_POOL))

    def _apply_event(self, event: EventDef) -> None:
        target_ids = self._event_targets(event)
        if not target_ids:
            return
        now = time.monotonic()
        value = event.value
        if event.key == "wild_current":
            value = random.uniform(-0.08, 0.08)
        applied_ids: list[str] = []
        for boat_id in target_ids:
            boat = self.boats[boat_id]
            if event.kind == "negative" and boat_id == self.last_negative_target:
                continue
            if any(e.get("kind") == "negative" and event.kind == "negative" for e in boat.active_events):
                continue
            active = {
                "key": event.key,
                "name": event.name,
                "description": event.description,
                "kind": event.kind,
                "value": value,
                "ends_at": now + event.duration,
            }
            boat.active_events.append(active)
            applied_ids.append(boat_id)
            if event.kind == "negative":
                self.last_negative_target = boat_id
        if applied_ids:
            grouped = len(applied_ids) > 1
            display_boat = self.boats[applied_ids[0]]
            self.event_log.appendleft(
                {
                    "boat_id": "all" if grouped else display_boat.boat_id,
                    "boat_name": "All Boats" if grouped else display_boat.name,
                    "name": event.name,
                    "description": event.description,
                    "kind": event.kind,
                    "timestamp": time.time(),
                }
            )

    def _event_targets(self, event: EventDef) -> list[str]:
        boats = list(self.boats.values())
        if event.target == "all":
            return [boat.boat_id for boat in boats]
        ranks = self._current_ranks()
        if event.target == "first":
            return [min(ranks, key=lambda boat_id: ranks[boat_id])]
        if event.target == "last":
            return [max(ranks, key=lambda boat_id: ranks[boat_id])]
        if event.target == "nonleading":
            choices = [boat.boat_id for boat in boats if ranks[boat.boat_id] != 1]
            return [random.choice(choices)] if choices else []
        counts = self.boat_counts()
        if event.target == "big":
            choices = [boat_id for boat_id, count in counts.items() if count > 15]
            return [random.choice(choices)] if choices else []
        if event.target == "small":
            choices = [boat_id for boat_id, count in counts.items() if 0 < count < 8]
            return [random.choice(choices)] if choices else []
        if event.target == "most_rowers":
            return [max(counts, key=lambda boat_id: counts[boat_id])]
        if event.target == "fewest_rowers":
            active = {boat_id: count for boat_id, count in counts.items() if count > 0}
            return [min(active, key=lambda boat_id: active[boat_id])] if active else []
        choices = [boat for boat in boats if len(boat.active_events) == 0]
        return [random.choice(choices or boats).boat_id]

    def _current_ranks(self) -> dict[str, int]:
        ordered = sorted(self.boats.values(), key=lambda b: (-b.position, -b.speed, b.boat_id))
        return {boat.boat_id: index + 1 for index, boat in enumerate(ordered)}

    def _rank_final_boats(self) -> None:
        ordered = sorted(
            self.boats.values(),
            key=lambda boat: (
                0 if boat.finish_time is not None else 1,
                boat.finish_time if boat.finish_time is not None else -boat.position,
                -boat.speed,
                random.random(),
            ),
        )
        for index, boat in enumerate(ordered, start=1):
            boat.rank = index

    def _round_scoreboard(self) -> list[dict[str, Any]]:
        counts = self.boat_counts()
        top_rower = max(
            (p for p in self.players.values() if p.selected_boat),
            key=lambda p: p.round_stats.get("contribution_power", 0),
            default=None,
        )
        return [
            {
                "boat_id": boat.boat_id,
                "name": boat.name,
                "color": boat.color,
                "rank": boat.rank,
                "position": round(boat.position, 1),
                "finish_time": round(boat.finish_time, 2) if boat.finish_time is not None else None,
                "rower_count": counts[boat.boat_id],
                "power_name": boat.power.name,
                "power_trait": boat.power.trait,
                "points": POINTS_BY_PLACE[boat.rank - 1],
                "top_rower": {
                    "nickname": top_rower.nickname,
                    "power": round(top_rower.round_stats.get("contribution_power", 0), 1),
                }
                if top_rower and top_rower.selected_boat == boat.boat_id
                else None,
            }
            for boat in sorted(self.boats.values(), key=lambda b: b.rank)
        ]

    def _build_final_leaderboard(self) -> None:
        self.final_leaderboard = [
            {
                "player_id": player.player_id,
                "nickname": player.nickname,
                "score": player.score,
                "rounds_played": player.rounds_played,
                "contribution_power": round(
                    player.total_alternating_taps + player.total_repeated_taps * 0.25, 1
                ),
            }
            for player in sorted(
                self.players.values(),
                key=lambda p: (
                    -p.score,
                    -(p.total_alternating_taps + p.total_repeated_taps * 0.25),
                    p.nickname.lower(),
                ),
            )
        ]

    def _event_name(self, boat: Boat) -> str | None:
        return boat.active_events[0]["name"] if boat.active_events else None

    def _event_summary(self, boat: Boat) -> dict[str, Any]:
        if not boat.active_events:
            return {
                "active_event": None,
                "active_event_description": None,
                "active_event_kind": None,
            }
        event = boat.active_events[0]
        return {
            "active_event": event["name"],
            "active_event_description": event["description"],
            "active_event_kind": event["kind"],
        }


game = GameState()
