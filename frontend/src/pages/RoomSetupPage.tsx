import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Clipboard, KeyRound, Plus, Sailboat } from "lucide-react";
import { getHttpUrl } from "../lib/socket";
import type { CapacityState } from "../types";

const passwordWords = [
  "river",
  "rapid",
  "paddle",
  "anchor",
  "sunny",
  "lucky",
  "finish",
  "sprint",
  "harbor",
  "current",
];

type CreatedRoom = {
  room: {
    room_id: string;
    name: string;
    max_players: number;
  };
  links: {
    player: string;
    projector: string;
    admin: string;
  };
};

function generateReadablePassword() {
  const first = passwordWords[Math.floor(Math.random() * passwordWords.length)];
  const second = passwordWords[Math.floor(Math.random() * passwordWords.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${first}-${second}-${suffix}`;
}

export function RoomSetupPage() {
  const [capacity, setCapacity] = useState<CapacityState | null>(null);
  const [roomName, setRoomName] = useState("Row Rush Room");
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [adminPassword, setAdminPassword] = useState("");
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const [createdPassword, setCreatedPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(getHttpUrl("/api/capacity"))
      .then((response) => response.json())
      .then((payload: CapacityState) => {
        setCapacity(payload);
        setMaxPlayers(Math.min(20, Math.max(1, payload.available_players)));
      })
      .catch(() => setError("Could not load room capacity."));
  }, []);

  const availablePlayers = capacity?.available_players ?? 0;
  const cappedMaxPlayers = useMemo(
    () => Math.max(1, Math.min(maxPlayers, Math.max(availablePlayers, 1))),
    [availablePlayers, maxPlayers],
  );

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!capacity || availablePlayers <= 0) {
      setError("No player slots are available right now.");
      return;
    }
    if (!adminPassword.trim()) {
      setError("Choose a room admin password first.");
      return;
    }
    const response = await fetch(getHttpUrl("/api/rooms"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: roomName,
        max_players: cappedMaxPlayers,
        admin_password: adminPassword,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.detail ?? "Could not create room.");
      return;
    }
    setCreatedRoom(payload);
    setCreatedPassword(adminPassword);
    setCapacity(payload.capacity);
  };

  const absoluteUrl = (path: string) => `${window.location.origin}${path}`;
  const emptyTtl = formatMinutes(capacity?.empty_room_ttl_seconds ?? 300);
  const finalTtl = formatMinutes(capacity?.final_results_ttl_seconds ?? 600);

  return (
    <div className="river-shell min-h-dvh p-4 font-display text-slate-950">
      <div className="mx-auto grid min-h-dvh max-w-5xl content-center gap-6 py-8">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-teal-200 shadow-glow">
            <Sailboat size={28} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-700">Row Rush</p>
            <h1 className="text-5xl font-black">Create a Room</h1>
          </div>
        </div>

        {createdRoom ? (
          <section className="glass-panel rounded-2xl p-5">
            <h2 className="text-3xl font-black">{createdRoom.room.name}</h2>
            <p className="mt-1 font-bold text-slate-600">
              Reserved {createdRoom.room.max_players} player slots. Empty rooms expire after {emptyTtl}, and final results stay for {finalTtl}.
            </p>
            <div className="mt-5 grid gap-3">
              <LinkRow label="Player Link" value={absoluteUrl(createdRoom.links.player)} />
              <LinkRow label="Projector Link" value={absoluteUrl(createdRoom.links.projector)} />
              <LinkRow label="Room Admin Link" value={absoluteUrl(createdRoom.links.admin)} />
              <LinkRow label="Room Admin Password" value={createdPassword} secret />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="admin-button bg-slate-950 text-white" href={createdRoom.links.admin}>
                Open Room Admin
              </a>
              <a className="admin-button bg-teal-600 text-white" href={createdRoom.links.projector}>
                Open Projector
              </a>
            </div>
          </section>
        ) : (
          <form className="glass-panel rounded-2xl p-5" onSubmit={createRoom}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Room Name</span>
                <input
                  className="mt-2 h-12 w-full rounded-lg border border-white/70 bg-white/85 px-4 font-bold outline-none ring-teal-500 transition focus:ring-2"
                  maxLength={48}
                  onChange={(event) => setRoomName(event.target.value)}
                  value={roomName}
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Reserved Player Slots</span>
                <input
                  className="mt-2 h-12 w-full rounded-lg border border-white/70 bg-white/85 px-4 font-bold outline-none ring-teal-500 transition focus:ring-2"
                  max={Math.max(availablePlayers, 1)}
                  min={1}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  type="number"
                  value={cappedMaxPlayers}
                />
              </label>
            </div>
            <p className="mt-3 rounded-xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-950 ring-1 ring-teal-100">
              Choose the number of player slots you realistically need. Reserved slots are held for your room until it ends, so leaving some capacity free helps other groups create their own races too.
            </p>
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 ring-1 ring-amber-100">
              Create the room when your group is close to ready: empty rooms expire after {emptyTtl}, and final results stay available for {finalTtl}.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Room Admin Password</span>
                <input
                  className="mt-2 h-12 w-full rounded-lg border border-white/70 bg-white/85 px-4 font-bold outline-none ring-teal-500 transition focus:ring-2"
                  maxLength={80}
                  minLength={4}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Type one or generate a friendly one"
                  type="text"
                  value={adminPassword}
                />
              </label>
              <button
                className="admin-button justify-center bg-white/85 text-slate-800 ring-1 ring-white/70"
                onClick={() => setAdminPassword(generateReadablePassword())}
                type="button"
              >
                <KeyRound size={18} /> Generate
              </button>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="font-bold text-slate-600">
                {capacity
                  ? `${capacity.available_players} of ${capacity.max_total_players} player slots available`
                  : "Checking available slots..."}
              </div>
              <button className="admin-button bg-slate-950 text-white disabled:bg-slate-300" disabled={!capacity || availablePlayers <= 0}>
                <Plus size={18} /> Create Room
              </button>
            </div>
            {error && <p className="mt-4 font-black text-rose-700">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function formatMinutes(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function LinkRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="grid gap-2 rounded-xl bg-white/70 p-3 shadow-sm md:grid-cols-[10rem_1fr_auto] md:items-center">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="break-all font-black text-slate-900">{secret ? value : value.replace(/^https?:\/\//, "")}</span>
      <button
        className="admin-button h-10 justify-center bg-slate-950 text-white"
        onClick={() => navigator.clipboard?.writeText(value)}
        type="button"
      >
        <Clipboard size={16} /> Copy
      </button>
    </div>
  );
}
