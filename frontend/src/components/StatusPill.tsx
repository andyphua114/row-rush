export function StatusPill({ status }: { status: "connecting" | "open" | "closed" }) {
  const label = status === "open" ? "Connected" : status === "connecting" ? "Connecting" : "Reconnecting";
  const color = status === "open" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm backdrop-blur">
      <span className={`h-2.5 w-2.5 rounded-full ${color} shadow-[0_0_14px_currentColor]`} />
      {label}
    </div>
  );
}
