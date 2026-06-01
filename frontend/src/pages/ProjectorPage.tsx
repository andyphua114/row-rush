import { lazy, Suspense, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { RaceState } from "../types";

const PixiRaceCanvas = lazy(() =>
  import("../components/PixiRaceCanvas").then((module) => ({
    default: module.PixiRaceCanvas,
  })),
);

export function ProjectorPage({ roomId }: { roomId: string }) {
  const { state, status } = useRowRushSocket<RaceState>("projector", { roomId });
  const joinUrl = `${window.location.origin}/r/${roomId}`;
  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-hidden bg-slate-950 font-display text-white">
      <div className="absolute left-6 top-5 z-20">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-100">
          {state?.room_name ?? "Row Rush"}
        </p>
        <h1 className="text-6xl font-black drop-shadow-lg">
          Round {Math.min(state?.round ?? 1, 3)}
        </h1>
      </div>
      <div className="absolute right-6 top-6 z-20">
        <StatusPill status={status} />
      </div>

      {!state || state.phase === "LOBBY" ? (
        <LobbyScreen joinUrl={joinUrl} />
      ) : null}
      {state?.phase === "BOAT_SELECTION" || state?.phase === "ADMIN_REVIEW" ? (
        <SelectionScreen state={state} />
      ) : null}
      {state ? (
        <Suspense fallback={<div className="absolute inset-0 bg-slate-950" />}>
          <PixiRaceCanvas state={state} />
        </Suspense>
      ) : null}
      {state?.phase === "COUNTDOWN" && <Countdown value={state.countdown} />}
      {state?.phase === "RACING" && <RaceOverlay state={state} />}
      {state?.phase === "ROUND_RESULTS" && <RoundResults state={state} />}
      {state?.phase === "ROUND_LEADERBOARD" && (
        <Leaderboard
          state={state}
          title="Leaderboard"
          subtitle={`After round ${state.round}`}
        />
      )}
      {state?.phase === "FINAL_RESULTS" && (
        <Leaderboard
          state={state}
          title="Final Leaderboard"
          subtitle="Champion rowers"
        />
      )}
    </div>
  );
}

function RaceOverlay({ state }: { state: RaceState }) {
  return (
    <>
      <div className="absolute bottom-6 right-6 z-20 rounded-2xl border border-white/15 bg-slate-950/78 px-6 py-4 text-right text-white shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-100">
          Time
        </p>
        <p className="text-5xl font-black text-white drop-shadow-lg">
          {Math.ceil(state.time_remaining)}s
        </p>
      </div>
      {state.events[0] && (
        <div className="absolute left-1/2 top-5 z-30 w-[min(680px,58vw)] -translate-x-1/2 rounded-2xl bg-amber-300 px-6 py-4 text-center text-slate-950 shadow-2xl ring-4 ring-amber-100/30">
          <p className="text-2xl font-black">{state.events[0].name}</p>
          <p className="text-base font-bold">
            {state.events[0].boat_name}: {state.events[0].description}
          </p>
        </div>
      )}
    </>
  );
}

function LobbyScreen({ joinUrl }: { joinUrl: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.72),#082f49_68%)] px-10 text-center">
      <div className="w-full max-w-6xl">
        <p className="text-xl font-black uppercase tracking-[0.28em] text-teal-100">
          Join the river
        </p>
        <h1 className="mt-3 text-8xl font-black drop-shadow-xl">Row Rush</h1>
        <p className="mt-5 text-3xl font-bold text-teal-50">
          Scan to grab a boat and row with your crew
        </p>
        <div className="mx-auto mt-10 grid w-fit gap-4 rounded-3xl bg-white p-6 text-slate-950 shadow-2xl">
          <QRCodeSVG
            value={joinUrl}
            size={220}
            level="M"
            fgColor="#020617"
            bgColor="#ffffff"
          />
          <p className="text-xl font-black">
            {joinUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectionScreen({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/55 px-8 text-center backdrop-blur-sm">
      <div className="projector-card rounded-3xl p-10">
        <h1 className="text-7xl font-black">Choose Your Boat</h1>
        <p className="mt-5 text-3xl font-bold text-teal-100">
          Open the game on your phone and pick a crew.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {state.boats.map((boat) => (
            <div
              key={boat.boat_id}
              className="inline-flex items-center gap-4 rounded-2xl bg-white px-6 py-4 text-2xl font-black text-slate-950 shadow-xl"
            >
              <span
                className="boat-mark boat-mark-sm"
                style={{ "--boat-color": boat.color } as CSSProperties}
              />
              {boat.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Countdown({ value }: { value?: string | number | null }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/55 text-[11rem] font-black backdrop-blur-sm">
      {value}
    </div>
  );
}

function RoundResults({ state }: { state: RaceState }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-8 backdrop-blur">
      <div className="w-full max-w-5xl">
        <h1 className="mb-6 text-center text-6xl font-black">Round Results</h1>
        <div className="grid gap-3">
          {state.round_results.map((result) => (
            <div
              key={result.boat_id}
              className="flex items-center justify-between rounded-2xl bg-white/95 px-6 py-4 text-slate-950 shadow-2xl"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl font-black">#{result.rank}</span>
                <span
                  className="boat-mark boat-mark-sm"
                  style={{ "--boat-color": result.color } as CSSProperties}
                />
                <div>
                  <p className="text-2xl font-black">{result.name}</p>
                  <p className="font-bold text-slate-500">
                    {result.power_name}: {result.power_trait}
                  </p>
                </div>
              </div>
              <div className="text-right text-xl font-black">
                {result.points} pts - {result.rower_count} rowers
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({
  state,
  title,
  subtitle,
}: {
  state: RaceState;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.76),#020617_70%)] p-8">
      <div className="w-full max-w-4xl">
        <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-teal-100">
          {subtitle}
        </p>
        <h1 className="mb-8 mt-2 text-center text-7xl font-black">{title}</h1>
        <div className="grid gap-3">
          {state.final_leaderboard.slice(0, 10).map((row, index) => (
            <div
              key={row.player_id}
              className="flex items-center justify-between rounded-2xl bg-white/95 px-6 py-4 text-slate-950 shadow-2xl"
            >
              <span className="text-3xl font-black">
                #{index + 1} {row.nickname}
              </span>
              <span className="text-3xl font-black text-teal-700">
                {row.score} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
