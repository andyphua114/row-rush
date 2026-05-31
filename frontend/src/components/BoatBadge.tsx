import type { CSSProperties } from "react";
import type { BoatSummary } from "../types";

export function BoatBadge({ boat, compact = false }: { boat?: BoatSummary | null; compact?: boolean }) {
  if (!boat) return null;
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/85 px-3 py-2 font-black text-slate-900 shadow-sm backdrop-blur">
      <span className="boat-mark boat-mark-sm shrink-0" style={{ "--boat-color": boat.color } as CSSProperties} />
      <span className={compact ? "text-sm" : "text-base"}>{boat.name}</span>
    </div>
  );
}
