import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Waves } from "lucide-react";
import { BoatBadge } from "../components/BoatBadge";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { BoatSummary, Contribution, PlayerState } from "../types";

type Side = "LEFT" | "RIGHT";

const emptyStats = (): Contribution => ({
  left_taps: 0,
  right_taps: 0,
  alternating_taps: 0,
  repeated_taps: 0,
  contribution_power: 0,
});

export function PlayerPage() {
  const { state, status, send } = useRowRushSocket<PlayerState>("player");
  const [nickname, setNickname] = useState(localStorage.getItem("row_rush_nickname") || "");
  const [selectionMessage, setSelectionMessage] = useState("");
  const [feedback, setFeedback] = useState<"good" | "weak" | "">("");
  const [localStats, setLocalStats] = useState(emptyStats);
  const bufferRef = useRef(emptyStats());
  const lastSideRef = useRef<Side | null>(null);
  const joined = Boolean(state?.nickname);

  const selectedBoat = useMemo(
    () => state?.boats?.find((boat) => boat.boat_id === state.selected_boat),
    [state?.boats, state?.selected_boat],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!state || state.phase !== "RACING" || !state.selected_boat) return;
      const buffered = bufferRef.current;
      const total = buffered.left_taps + buffered.right_taps + buffered.alternating_taps + buffered.repeated_taps;
      if (!total) return;
      send({
        type: "tap_update",
        player_id: localStorage.getItem("row_rush_player_id"),
        round: state.round,
        boat_id: state.selected_boat,
        ...buffered,
      });
      bufferRef.current = emptyStats();
    }, 200);
    return () => window.clearInterval(timer);
  }, [send, state]);

  useEffect(() => {
    if (state?.phase !== "RACING") {
      bufferRef.current = emptyStats();
      lastSideRef.current = null;
      setLocalStats(emptyStats());
    }
  }, [state?.phase, state?.round]);

  useEffect(() => {
    setSelectionMessage("");
  }, [state?.phase, state?.round, state?.selected_boat]);

  useEffect(() => {
    const onSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; message: string }>).detail;
      setSelectionMessage(detail.message);
    };
    window.addEventListener("row-rush-selection", onSelection);
    return () => window.removeEventListener("row-rush-selection", onSelection);
  }, []);

  if (!state || !joined) {
    return (
      <Shell status={status}>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-600 text-white shadow-glow">
              <Waves size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-950">Row Rush</h1>
              <p className="font-semibold text-slate-600">Grab a boat. Find a rhythm.</p>
            </div>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const clean = nickname.trim();
              if (!clean) return;
              localStorage.setItem("row_rush_nickname", clean);
              send({
                type: "join",
                nickname: clean,
                player_id: localStorage.getItem("row_rush_player_id"),
              });
            }}
          >
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="h-16 w-full rounded-lg border-2 border-slate-200 bg-white px-4 text-xl font-bold outline-none focus:border-teal-500"
              maxLength={24}
              placeholder="Nickname"
            />
            <button className="h-16 w-full rounded-lg bg-teal-600 text-xl font-black text-white shadow-lg shadow-teal-900/20 active:scale-[0.99]">
              Join Race
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  if (state.phase === "BOAT_SELECTION" || state.phase === "ADMIN_REVIEW") {
    if (state.selected_boat) {
      return (
        <Shell status={status}>
          <Centered>
            <BoatBadge boat={selectedBoat} />
            <h1 className="mt-5 text-3xl font-black text-slate-950">You are on {state.selected_boat_name}</h1>
            <p className="mt-2 text-lg font-bold text-slate-600">Round {state.round}. Waiting for the race to start.</p>
          </Centered>
        </Shell>
      );
    }
    return (
      <Shell status={status}>
        <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-7">
          <Header state={state} />
          <h1 className="mt-7 text-3xl font-black text-slate-950">Choose your boat</h1>
          <p className="mt-1 font-semibold text-slate-600">First come, first served. Pick the crew you want.</p>
          {selectionMessage && (
            <div className="mt-4 rounded-lg bg-amber-100 px-4 py-3 font-bold text-amber-900">{selectionMessage}</div>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {state.boats.map((boat) => (
              <button
                key={boat.boat_id}
                className="flex min-h-28 items-center gap-4 rounded-lg border-2 border-white bg-white p-4 text-left shadow-sm active:scale-[0.99]"
                onClick={() => {
                  setSelectionMessage("");
                  send({ type: "select_boat", boat_id: boat.boat_id });
                }}
              >
                <span className="h-16 w-16 shrink-0 rounded-lg shadow-inner" style={{ backgroundColor: boat.color }} />
                <span>
                  <span className="block text-xl font-black text-slate-950">{boat.name}</span>
                  <span className="text-sm font-bold text-slate-500">Tap to join this crew</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (state.phase === "COUNTDOWN" || state.phase === "RACING") {
    return (
      <Shell status={status} raceMode>
        <RaceControls
          state={state}
          feedback={feedback}
          localStats={localStats}
          onTap={(side) => {
            const last = lastSideRef.current;
            const good = !last || last !== side;
            const delta = emptyStats();
            delta.left_taps = side === "LEFT" ? 1 : 0;
            delta.right_taps = side === "RIGHT" ? 1 : 0;
            delta.alternating_taps = good ? 1 : 0;
            delta.repeated_taps = good ? 0 : 1;
            delta.contribution_power = delta.alternating_taps + delta.repeated_taps * 0.25;
            for (const key of Object.keys(delta) as (keyof Contribution)[]) {
              bufferRef.current[key] += delta[key];
            }
            setLocalStats((current) => ({
              left_taps: current.left_taps + delta.left_taps,
              right_taps: current.right_taps + delta.right_taps,
              alternating_taps: current.alternating_taps + delta.alternating_taps,
              repeated_taps: current.repeated_taps + delta.repeated_taps,
              contribution_power: current.contribution_power + delta.contribution_power,
            }));
            lastSideRef.current = side;
            setFeedback(good ? "good" : "weak");
            if ("vibrate" in navigator) navigator.vibrate(good ? 18 : 8);
            window.setTimeout(() => setFeedback(""), 120);
          }}
        />
      </Shell>
    );
  }

  if (state.phase === "ROUND_RESULTS" || state.phase === "ROUND_LEADERBOARD") {
    const result = state.last_round_result;
    return (
      <Shell status={status}>
        <Centered>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Round {state.round} results</p>
          <h1 className="mt-3 text-5xl font-black text-slate-950">#{result?.placement ?? "-"}</h1>
          <p className="mt-2 text-xl font-black text-slate-700">{result?.boat_name ?? state.selected_boat_name}</p>
          <div className="mt-7 grid w-full max-w-sm grid-cols-2 gap-3">
            <Metric label="Round Points" value={result?.points ?? 0} />
            <Metric label="Total Score" value={state.score} />
            <Metric label="Boat Points" value={result?.placement_points ?? 0} />
            <Metric
              label="Tap Bonus"
              value={`+${(result?.accuracy_bonus ?? 0) + (result?.contribution_bonus ?? 0)}`}
            />
            <Metric label="Accuracy" value={`${Math.round((result?.accuracy_rate ?? 0) * 100)}%`} />
            <Metric label="Good Strokes" value={result?.contribution?.alternating_taps ?? 0} />
          </div>
        </Centered>
      </Shell>
    );
  }

  if (state.phase === "FINAL_RESULTS") {
    return (
      <Shell status={status}>
        <Centered>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Final Results</p>
          <h1 className="mt-3 text-5xl font-black text-slate-950">#{state.final_rank ?? "-"}</h1>
          <p className="mt-2 text-xl font-black text-slate-700">{state.score} points</p>
          <div className="mt-6 w-full max-w-sm rounded-lg bg-white p-4 shadow-sm">
            {state.final_leaderboard?.slice(0, 5).map((row, index) => (
              <div key={row.player_id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
                <span className="font-black text-slate-800">#{index + 1} {row.nickname}</span>
                <span className="font-black text-teal-700">{row.score}</span>
              </div>
            ))}
          </div>
        </Centered>
      </Shell>
    );
  }

  return (
    <Shell status={status}>
      <Centered>
        <Header state={state} />
        <h1 className="mt-8 text-3xl font-black text-slate-950">Waiting for host</h1>
        <p className="mt-2 text-lg font-bold text-slate-600">Boat selection will open soon.</p>
      </Centered>
    </Shell>
  );
}

function RaceControls({
  state,
  feedback,
  localStats,
  onTap,
}: {
  state: PlayerState;
  feedback: string;
  localStats: Contribution;
  onTap: (side: Side) => void;
}) {
  const boat = state.race_boat;
  const disabled = state.phase !== "RACING";
  return (
    <div className="flex min-h-dvh touch-none select-none flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-200">Round {state.round}</p>
          <h1 className="text-2xl font-black" style={{ color: state.selected_boat_color ?? "#fff" }}>
            {state.selected_boat_name}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-200">Rank</p>
          <p className="text-3xl font-black">#{boat?.rank ?? "-"}</p>
        </div>
      </div>
      <div className="relative flex flex-1 flex-col justify-center px-4">
        {state.countdown && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/70 text-7xl font-black">
            {state.countdown}
          </div>
        )}
        <div className="rounded-lg bg-white/10 p-4">
          <div className="mb-4 grid gap-2 text-left">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-200">Boat Power</p>
              <p className="mt-1 text-sm font-black text-white">{boat?.power_name ?? "Revealing soon"}</p>
              {boat?.power_trait && <p className="text-xs font-bold text-slate-300">{boat.power_trait}</p>}
            </div>
            <div
              className={`rounded-lg px-3 py-2 ${
                boat?.active_event_kind === "negative"
                  ? "bg-rose-300 text-slate-950"
                  : boat?.active_event_kind === "mixed"
                    ? "bg-violet-300 text-slate-950"
                    : boat?.active_event
                      ? "bg-amber-300 text-slate-950"
                      : "bg-white/10 text-white"
              }`}
            >
              <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${boat?.active_event ? "text-slate-700" : "text-teal-200"}`}>
                Active Effect
              </p>
              <p className="mt-1 text-sm font-black">{boat?.active_event ?? "No active effect"}</p>
              {boat?.active_event_description && (
                <p className="text-xs font-bold text-slate-700">{boat.active_event_description}</p>
              )}
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between text-sm font-black text-slate-200">
            <span>{Math.ceil(state.time_remaining)}s</span>
            <span>{Math.round(boat?.progress ?? 0)}%</span>
          </div>
          <div className="h-8 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${boat?.progress ?? 0}%`, backgroundColor: state.selected_boat_color ?? "#14b8a6" }}
            />
          </div>
          <div className={`mt-5 text-center text-3xl font-black ${feedback === "good" ? "text-emerald-300" : feedback === "weak" ? "text-amber-300" : "text-white"}`}>
            {feedback === "good" ? "GOOD STROKE" : feedback === "weak" ? "WEAK STROKE" : "ROW"}
          </div>
          <div className="mt-2 text-center text-sm font-bold text-slate-300">
            {localStats.alternating_taps} good - {localStats.repeated_taps} weak
          </div>
        </div>
      </div>
      <div className="flex min-h-36 items-center justify-center gap-10 px-6 pb-6 pt-2">
        <TapButton label="LEFT" disabled={disabled} onTap={() => onTap("LEFT")} />
        <TapButton label="RIGHT" disabled={disabled} onTap={() => onTap("RIGHT")} />
      </div>
    </div>
  );
}

function TapButton({ label, disabled, onTap }: { label: Side; disabled: boolean; onTap: () => void }) {
  return (
    <button
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        if (!disabled) onTap();
      }}
      className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white text-lg font-black text-slate-950 shadow-lg shadow-black/30 ring-4 ring-white/20 active:scale-95 disabled:opacity-40 sm:h-28 sm:w-28 sm:text-xl"
    >
      {label}
    </button>
  );
}

function Header({ state }: { state: PlayerState }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Round {state.round}</p>
        <p className="text-xl font-black text-slate-900">{state.nickname}</p>
      </div>
      <div className="rounded-full bg-white px-4 py-2 font-black text-slate-800 shadow-sm">{state.score} pts</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white p-4 text-left shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid min-h-dvh w-full max-w-xl place-items-center px-5 py-8 text-center">{children}</div>;
}

function Shell({ children, status, raceMode = false }: { children: ReactNode; status: "connecting" | "open" | "closed"; raceMode?: boolean }) {
  if (raceMode) return <>{children}</>;
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#e0f7f4,#f8fafc_42%,#e0f2fe)] font-display">
      <div className="fixed right-4 top-4 z-20">
        <StatusPill status={status} />
      </div>
      {children}
    </div>
  );
}
