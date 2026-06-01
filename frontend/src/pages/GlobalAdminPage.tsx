import type { FormEvent } from "react";
import { useState } from "react";
import { Lock, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useRowRushSocket } from "../lib/socket";
import type { GlobalAdminState, RoomSummary } from "../types";

const GLOBAL_ADMIN_PASSWORD_SESSION_KEY = "row_rush_global_admin_password";

export function GlobalAdminPage() {
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem(GLOBAL_ADMIN_PASSWORD_SESSION_KEY) ?? "",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const { state, status, lastError, send } = useRowRushSocket<GlobalAdminState>("global_admin", {
    adminPassword,
    enabled: Boolean(adminPassword),
  });

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordInput) return;
    sessionStorage.setItem(GLOBAL_ADMIN_PASSWORD_SESSION_KEY, passwordInput);
    setAdminPassword(passwordInput);
    setPasswordInput("");
  };

  const clearPassword = () => {
    sessionStorage.removeItem(GLOBAL_ADMIN_PASSWORD_SESSION_KEY);
    setAdminPassword("");
    setPasswordInput("");
  };

  return (
    <div className="river-shell min-h-dvh p-4 font-display text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Server Control</p>
            <h1 className="text-5xl font-black">Global Admin</h1>
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
                <h2 className="text-2xl font-black">Global Password</h2>
                <p className="text-sm font-bold text-slate-500">Required for server-wide controls.</p>
              </div>
            </div>
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-lg border border-white/70 bg-white/85 px-4 font-bold outline-none ring-teal-500 transition focus:ring-2"
              onChange={(event) => setPasswordInput(event.target.value)}
              type="password"
              value={passwordInput}
            />
            <button className="admin-button mt-4 w-full justify-center bg-slate-950 text-white" type="submit">
              <Lock size={18} /> Unlock Global Admin
            </button>
          </form>
        ) : !state ? (
          <div className="glass-panel mt-8 rounded-2xl p-6 font-bold">
            {lastError ? <span className="text-rose-700">{lastError}</span> : "Waiting for server state..."}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <Stat label="Total Capacity" value={state.capacity.max_total_players} />
              <Stat label="Reserved" value={state.capacity.reserved_players} />
              <Stat label="Available" value={state.capacity.available_players} />
            </div>
            <section className="glass-panel mt-5 rounded-2xl p-4">
              <h2 className="mb-4 text-2xl font-black">Rooms</h2>
              {state.rooms.length ? (
                <div className="grid gap-3">
                  {state.rooms.map((room) => (
                    <RoomRow
                      key={room.room_id}
                      room={room}
                      onReset={() => {
                        if (window.confirm(`Reset ${room.name}?`)) send({ type: "global_reset_room", room_id: room.room_id });
                      }}
                      onDestroy={() => {
                        if (window.confirm(`Destroy ${room.name} and free ${room.max_players} reserved slots?`)) {
                          send({ type: "global_destroy_room", room_id: room.room_id });
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="font-bold text-slate-500">No active rooms.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function RoomRow({ room, onReset, onDestroy }: { room: RoomSummary; onReset: () => void; onDestroy: () => void }) {
  return (
    <div className="grid gap-3 rounded-xl bg-white/70 p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-black">{room.name}</h3>
          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">
            {room.phase.replace("_", " ")}
          </span>
        </div>
        <p className="mt-1 break-all text-sm font-bold text-slate-500">{room.room_id}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-black text-slate-700">
          <span>{room.total_players} / {room.max_players} players</span>
          <span>{room.connected_clients} clients connected</span>
          <span>Round {Math.min(room.round, 3)} / 3</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="admin-button bg-amber-500 text-slate-950" onClick={onReset}>
          <RotateCcw size={18} /> Reset
        </button>
        <button className="admin-button bg-rose-600 text-white" onClick={onDestroy}>
          <Trash2 size={18} /> Destroy
        </button>
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
