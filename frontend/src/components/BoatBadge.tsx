import type { BoatSummary } from "../types";

export function BoatBadge({ boat, compact = false }: { boat?: BoatSummary | null; compact?: boolean }) {
  if (!boat) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 font-black text-slate-900 shadow-sm">
      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: boat.color }} />
      <span className={compact ? "text-sm" : "text-base"}>{boat.name}</span>
    </div>
  );
}
