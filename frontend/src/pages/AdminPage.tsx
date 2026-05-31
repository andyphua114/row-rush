import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";
import { Lock, LogOut, RotateCcw, Sailboat, Timer, Trophy } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { AdminState } from "../types";

const ADMIN_PASSWORD_SESSION_KEY = "row_rush_admin_password";

export function AdminPage() {
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem(ADMIN_PASSWORD_SESSION_KEY) ?? "",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const { state, status, lastError, send } = useRowRushSocket<AdminState>("admin", {
    adminPassword,
    enabled: Boolean(adminPassword),
  });

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordInput) return;
    sessionStorage.setItem(ADMIN_PASSWORD_SESSION_KEY, passwordInput);
    setAdminPassword(passwordInput);
    setPasswordInput("");
  };

  const clearPassword = () => {
    sessionStorage.removeItem(ADMIN_PASSWORD_SESSION_KEY);
    setAdminPassword("");
    setPasswordInput("");
  };

  return (
    <div className="river-shell min-h-dvh p-4 font-display text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Row Rush Control</p>
            <h1 className="text-5xl font-black">Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            {adminPassword && (
              <button className="admin-button h-10 bg-white/80 text-slate-700" onClick={clearPassword}>
                <LogOut size={18} /> Lock
              </button>
            )}
            <StatusPill status={status} />
          </div>
        </div>

        {!adminPassword ? (
          <form className="glass-panel mt-8 max-w-md rounded-2xl p-6" onSubmit={submitPassword}>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
                <Lock size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-black">Admin Password</h2>
                <p className="text-sm font-bold text-slate-500">Required to open race control.</p>
              </div>
            </div>
            <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-500" htmlFor="admin-password">
              Password
            </label>
            <input
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-lg border border-white/70 bg-white/85 px-4 font-bold outline-none ring-teal-500 transition focus:ring-2"
              id="admin-password"
              onChange={(event) => setPasswordInput(event.target.value)}
              type="password"
              value={passwordInput}
            />
            <button className="admin-button mt-4 w-full justify-center bg-slate-950 text-white" type="submit">
              <Lock size={18} /> Unlock Admin
            </button>
          </form>
        ) : !state ? (
          <div className="glass-panel mt-8 rounded-2xl p-6 font-bold">
            {lastError ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-rose-700">{lastError}</span>
                <button className="admin-button bg-slate-950 text-white" onClick={clearPassword}>
                  <LogOut size={18} /> Try Again
                </button>
              </div>
            ) : (
              "Waiting for server state..."
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <Stat label="Phase" value={state.phase.replace("_", " ")} />
              <Stat label="Round" value={`${Math.min(state.round, 3)} / 3`} />
              <Stat label="Players" value={`${state.connected_players} / ${state.total_players}`} />
              <Stat label="Boat Cap" value={state.boat_capacity || "-"} />
            </div>

            <div className="glass-panel mt-5 flex flex-wrap gap-3 rounded-2xl p-4">
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
              <section className="glass-panel rounded-2xl p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-2xl font-black">Boats</h2>
                  <span className="font-bold text-slate-500">{Math.ceil(state.time_remaining)}s</span>
                </div>
                <div className="space-y-3">
                  {state.boats.map((boat) => (
                    <div key={boat.boat_id} className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="boat-mark boat-mark-sm shrink-0"
                            style={{ "--boat-color": boat.color } as CSSProperties}
                          />
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

              <section className="glass-panel rounded-2xl p-4">
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
    <div className="glass-panel rounded-2xl p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/65 px-3 py-3 font-black shadow-sm">
      <span>{left}</span>
      <span className="text-teal-700">{right}</span>
    </div>
  );
}
