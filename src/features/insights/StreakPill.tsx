import { Flame } from "lucide-react";

export function StreakPill({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <span className="text-primary-text bg-primary/15 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap">
      <Flame className="size-4" strokeWidth={2.25} />
      {days}-day streak
    </span>
  );
}
