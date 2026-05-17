import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Gauge, Trophy, Waves, Zap } from "lucide-react";
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
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-[1.25rem] bg-slate-950 text-teal-200 shadow-glow ring-4 ring-white/70">
              <Waves size={32} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Live river race</p>
              <h1 className="text-5xl font-black text-slate-950">Row Rush</h1>
              <p className="font-bold text-slate-600">Grab a boat. Find a rhythm.</p>
            </div>
          </div>
          <form
            className="glass-panel rounded-2xl p-3"
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
              className="h-16 w-full rounded-xl border-2 border-white bg-white/90 px-4 text-xl font-black text-slate-950 outline-none transition focus:border-teal-500 focus:bg-white"
              maxLength={24}
              placeholder="Nickname"
            />
            <button className="mt-3 h-16 w-full rounded-xl bg-slate-950 text-xl font-black text-white shadow-lg shadow-teal-900/20 transition active:scale-[0.99]">
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
          <div className="mt-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Round {state.round} draft</p>
            <h1 className="mt-1 text-4xl font-black text-slate-950">Choose your boat</h1>
            <p className="mt-2 font-bold text-slate-600">First come, first served. Pick the crew you want.</p>
          </div>
          {selectionMessage && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100 px-4 py-3 font-black text-amber-950 shadow-sm">
              {selectionMessage}
            </div>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {state.boats.map((boat) => (
              <button
                key={boat.boat_id}
                className="group relative flex min-h-32 items-center gap-4 overflow-hidden rounded-2xl border border-white/80 bg-white/85 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]"
                onClick={() => {
                  setSelectionMessage("");
                  send({ type: "select_boat", boat_id: boat.boat_id });
                }}
              >
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: boat.color }}
                />
                <span className="boat-mark shrink-0" style={{ "--boat-color": boat.color } as CSSProperties} />
                <span>
                  <span className="block text-xl font-black text-slate-950">{boat.name}</span>
                  <span className="mt-1 block text-sm font-black uppercase tracking-[0.12em] text-slate-500">
                    Tap to join this crew
                  </span>
                </span>
                <ChevronRight className="ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700" />
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
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-glow">
            <Trophy size={32} />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-teal-700">Round {state.round} results</p>
          <h1 className="mt-3 text-6xl font-black text-slate-950">#{result?.placement ?? "-"}</h1>
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
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-glow">
            <Trophy size={32} />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-teal-700">Final Results</p>
          <h1 className="mt-3 text-6xl font-black text-slate-950">#{state.final_rank ?? "-"}</h1>
          <p className="mt-2 text-xl font-black text-slate-700">{state.score} points</p>
          <div className="glass-panel mt-6 w-full max-w-sm rounded-2xl p-4">
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
  const progress = Math.max(0, Math.min(100, boat?.progress ?? 0));
  const pulseClass = feedback === "good" ? "stroke-flash-good" : feedback === "weak" ? "stroke-flash-weak" : "";
  return (
    <div className="river-race relative flex min-h-dvh touch-none select-none flex-col overflow-hidden text-white">
      <div className="relative z-10 flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-100">Round {state.round}</p>
          <h1 className="mt-1 text-2xl font-black" style={{ color: state.selected_boat_color ?? "#fff" }}>
            {state.selected_boat_name}
          </h1>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-2 text-right ring-1 ring-white/15">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-100">Rank</p>
          <p className="text-3xl font-black leading-none">#{boat?.rank ?? "-"}</p>
        </div>
      </div>
      <div className="relative z-10 flex flex-1 flex-col justify-center px-4">
        {state.countdown && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/70 text-8xl font-black backdrop-blur-sm">
            {state.countdown}
          </div>
        )}
        <div className={`race-panel rounded-3xl p-4 transition ${pulseClass}`}>
          <div className="mb-5 flex items-center gap-3">
            <span
              className="boat-mark shrink-0"
              style={{ "--boat-color": state.selected_boat_color ?? "#14b8a6" } as CSSProperties}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-100">Stroke rhythm</p>
              <p className="truncate text-2xl font-black">
                {feedback === "good" ? "Clean pull" : feedback === "weak" ? "Reset rhythm" : "Ready"}
              </p>
            </div>
            <Gauge className="ml-auto text-teal-100" />
          </div>
          <div className="mb-4 grid gap-2 text-left">
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-100">Boat Power</p>
              <p className="mt-1 text-base font-black text-white">{boat?.power_name ?? "Revealing soon"}</p>
              {boat?.power_trait && <p className="text-xs font-bold text-slate-300">{boat.power_trait}</p>}
            </div>
            <div
              className={`rounded-2xl px-4 py-3 shadow-sm ${
                boat?.active_event_kind === "negative"
                  ? "bg-rose-300 text-slate-950 ring-1 ring-rose-100"
                  : boat?.active_event_kind === "mixed"
                    ? "bg-violet-300 text-slate-950 ring-1 ring-violet-100"
                    : boat?.active_event
                      ? "bg-amber-300 text-slate-950 ring-1 ring-amber-100"
                      : "bg-white/10 text-white"
              }`}
            >
              <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${boat?.active_event ? "text-slate-700" : "text-teal-100"}`}>
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
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-9 overflow-hidden rounded-full bg-black/35 p-1 ring-1 ring-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.3),transparent)] transition-all duration-200"
              style={{ width: `${progress}%`, backgroundColor: state.selected_boat_color ?? "#14b8a6" }}
            />
          </div>
          <div className={`mt-6 text-center text-4xl font-black ${feedback === "good" ? "text-emerald-300" : feedback === "weak" ? "text-amber-300" : "text-white"}`}>
            {feedback === "good" ? "GOOD STROKE" : feedback === "weak" ? "WEAK STROKE" : "ROW"}
          </div>
          <div className="mx-auto mt-2 inline-flex w-full items-center justify-center gap-3 text-sm font-black text-slate-300">
            <Zap size={16} className="text-emerald-300" />
            {localStats.alternating_taps} good
            <span className="h-1 w-1 rounded-full bg-slate-500" />
            {localStats.repeated_taps} weak
          </div>
        </div>
      </div>
      <div className="relative z-10 flex min-h-36 items-center justify-center gap-8 px-6 pb-6 pt-2">
        <TapButton label="LEFT" disabled={disabled} onTap={() => onTap("LEFT")} />
        <TapButton label="RIGHT" disabled={disabled} onTap={() => onTap("RIGHT")} />
      </div>
    </div>
  );
}

function TapButton({ label, disabled, onTap }: { label: Side; disabled: boolean; onTap: () => void }) {
  const Icon = label === "LEFT" ? ChevronLeft : ChevronRight;
  return (
    <button
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        if (!disabled) onTap();
      }}
      className="tap-button grid h-28 w-28 shrink-0 place-items-center rounded-full text-lg font-black text-slate-950 shadow-2xl shadow-black/30 ring-4 ring-white/20 transition active:scale-95 disabled:opacity-40 sm:h-32 sm:w-32 sm:text-xl"
    >
      <span className="relative z-10 flex flex-col items-center gap-1">
        <Icon size={34} strokeWidth={3} />
        {label}
      </span>
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
      <div className="rounded-full border border-white/70 bg-white/85 px-4 py-2 font-black text-slate-800 shadow-sm backdrop-blur">
        {state.score} pts
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-panel rounded-2xl p-4 text-left">
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
    <div className="river-shell min-h-dvh font-display">
      <div className="fixed right-4 top-4 z-20">
        <StatusPill status={status} />
      </div>
      {children}
    </div>
  );
}
