import { RotateCcw, Sailboat, Timer, Trophy } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { AdminState } from "../types";

export function AdminPage() {
  const { state, status, send } = useRowRushSocket<AdminState>("admin");

  return (
    <div className="min-h-dvh bg-slate-100 p-4 font-display text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Row Rush Control</p>
            <h1 className="text-4xl font-black">Admin</h1>
          </div>
          <StatusPill status={status} />
        </div>

        {!state ? (
          <div className="mt-8 rounded-lg bg-white p-6 font-bold shadow-sm">Waiting for server state...</div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <Stat label="Phase" value={state.phase.replace("_", " ")} />
              <Stat label="Round" value={`${Math.min(state.round, 3)} / 3`} />
              <Stat label="Players" value={`${state.connected_players} / ${state.total_players}`} />
              <Stat label="Boat Cap" value={state.boat_capacity || "-"} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3 rounded-lg bg-white p-4 shadow-sm">
              <button
                className="admin-button bg-teal-600 text-white disabled:bg-slate-300"
                disabled={state.phase !== "LOBBY" || state.round > 3}
                onClick={() => send({ type: "admin_open_boat_selection" })}
              >
                <Sailboat size={20} /> Open Boat Selection
              </button>
              <button
                className="admin-button bg-indigo-600 text-white disabled:bg-slate-300"
                disabled={!["BOAT_SELECTION", "ADMIN_REVIEW"].includes(state.phase)}
                onClick={() => send({ type: "admin_start_race" })}
              >
                <Timer size={20} /> Start Race
              </button>
              <button
                className="admin-button bg-amber-500 text-slate-950 disabled:bg-slate-300 disabled:text-white"
                disabled={!["ROUND_RESULTS", "ROUND_LEADERBOARD"].includes(state.phase)}
                onClick={() => send({ type: "admin_next_round" })}
              >
                <Trophy size={20} /> {state.round >= 3 ? "Final Results" : "Next Round"}
              </button>
              {state.phase === "ROUND_RESULTS" && (
                <button
                  className="admin-button bg-slate-900 text-white"
                  onClick={() => send({ type: "admin_show_leaderboard" })}
                >
                  <Trophy size={20} /> Show Projector Leaderboard
                </button>
              )}
              {state.phase === "ROUND_LEADERBOARD" && (
                <button
                  className="admin-button bg-slate-700 text-white"
                  onClick={() => send({ type: "admin_show_round_results" })}
                >
                  <Trophy size={20} /> Show Round Results
                </button>
              )}
              <button
                className="admin-button bg-rose-600 text-white"
                onClick={() => {
                  if (window.confirm("Reset Row Rush for everyone?")) send({ type: "admin_reset_game" });
                }}
              >
                <RotateCcw size={20} /> Reset Game
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
              <section className="rounded-lg bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black">Boats</h2>
                  <span className="font-bold text-slate-500">{Math.ceil(state.time_remaining)}s</span>
                </div>
                <div className="space-y-3">
                  {state.boats.map((boat) => (
                    <div key={boat.boat_id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-10 w-10 rounded-lg" style={{ backgroundColor: boat.color }} />
                          <div>
                            <p className="text-lg font-black">{boat.name}</p>
                            <p className="text-sm font-bold text-slate-500">
                              {boat.power_name}: {boat.power_trait}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black">{state.boat_counts[boat.boat_id] ?? 0}</p>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">rowers</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-xl font-black">{state.phase === "FINAL_RESULTS" ? "Final Leaderboard" : "Round Results"}</h2>
                {state.phase === "FINAL_RESULTS" ? (
                  <div className="space-y-2">
                    {state.final_leaderboard.slice(0, 10).map((row, index) => (
                      <Row key={row.player_id} left={`#${index + 1} ${row.nickname}`} right={`${row.score} pts`} />
                    ))}
                  </div>
                ) : state.round_results.length ? (
                  <div className="space-y-2">
                    {state.round_results.map((result) => (
                      <Row
                        key={result.boat_id}
                        left={`#${result.rank} ${result.name}`}
                        right={`${result.points} pts - ${result.rower_count} rowers`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="font-bold text-slate-500">Results appear after each race.</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-3 font-black">
      <span>{left}</span>
      <span className="text-teal-700">{right}</span>
    </div>
  );
}
