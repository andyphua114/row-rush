export function StatusPill({ status }: { status: "connecting" | "open" | "closed" }) {
  const label = status === "open" ? "Connected" : status === "connecting" ? "Connecting" : "Reconnecting";
  const color = status === "open" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}
