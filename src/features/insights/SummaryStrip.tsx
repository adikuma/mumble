import { MetaLabel, Surface } from "@/components/kit/layout";
import { Sparkline } from "@/features/insights/Sparkline";

export interface SummaryStat {
  label: string;
  value: string;
  unit?: string;
  points: number[];
}

export function SummaryStrip({
  title,
  dateLabel,
  stats,
}: {
  title: string;
  dateLabel: string;
  stats: SummaryStat[];
}) {
  return (
    <Surface className="p-0">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs">{dateLabel}</span>
      </div>
      <div className="divide-border grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 md:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-4">
            <MetaLabel className="block">{s.label}</MetaLabel>
            <div className="text-stat mt-1.5 leading-none font-semibold tabular-nums">
              {s.value}
              {s.unit ? (
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  {s.unit}
                </span>
              ) : null}
            </div>
            <div className="mt-3 h-8">
              <Sparkline points={s.points} />
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}
