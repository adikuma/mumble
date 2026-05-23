import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import {
  getInsights,
  isTauri,
  type DailyBucket,
  type InsightsData,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";

// how many days the contribution heatmap spans. a full year so the grid
// fills the card width like github's contribution graph.
const HEATMAP_DAYS = 364;

function formatMinutes(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} sec`;
  const mins = Math.floor(sec / 60);
  return `${mins} min`;
}

function formatHoursMinutes(sec: number): string {
  if (sec < 60) return "0:00";
  const totalMins = Math.floor(sec / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `0:${mins.toString().padStart(2, "0")}`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

function emDash(): string {
  return "—";
}

export function InsightsView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const [data, setData] = useState<InsightsData | null>(null);
  const [heat, setHeat] = useState<DailyBucket[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    getInsights(7)
      .then(setData)
      .catch(() => setData(null));
    getInsights(HEATMAP_DAYS)
      .then((d) => setHeat(d.dailyActivity))
      .catch(() => setHeat([]));
    // refetch when transcripts change so new dictations show up live
  }, [transcripts.length]);

  const empty = !data || data.sessions === 0;

  return (
    <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-[880px] px-7 pt-6 pb-16">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">
              {empty
                ? emDash()
                : `You spoke for ${formatMinutes(data!.timeSavedSec)} this week`}
            </h1>
            <p className="text-muted-foreground text-xs">
              {empty
                ? emDash()
                : `Across ${data!.sessions} ${data!.sessions === 1 ? "transcript" : "transcripts"}.`}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Stat
              label="Words"
              value={empty ? emDash() : data!.words.toLocaleString()}
            />
            <Stat
              label="Sessions"
              value={empty ? emDash() : data!.sessions.toLocaleString()}
            />
            <Stat
              label="Avg latency"
              value={
                empty || data!.avgLatencyMs === null
                  ? emDash()
                  : `${data!.avgLatencyMs}`
              }
              unit={!empty && data!.avgLatencyMs !== null ? "ms" : undefined}
            />
            <Stat
              label="Time saved"
              value={empty ? emDash() : formatHoursMinutes(data!.timeSavedSec)}
              unit={!empty ? "hr" : undefined}
            />
          </div>

          <Heatmap days={heat} />

          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <ListCard
              title="Where you pasted"
              entries={empty ? [] : data!.topApps}
            />
            <ListCard title="Top words" entries={empty ? [] : data!.topWords} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 0 is the empty (no activity) shade, 1 to 4 ramp the indigo intensity by
// how busy the day was relative to the busiest day in range.
function shadeColor(level: number): string {
  switch (level) {
    case 1:
      return "hsl(248 53% 58% / 0.3)";
    case 2:
      return "hsl(248 53% 58% / 0.52)";
    case 3:
      return "hsl(248 53% 58% / 0.74)";
    case 4:
      return "hsl(248 53% 58%)";
    default:
      return "hsl(var(--muted))";
  }
}

function Heatmap({ days }: { days: DailyBucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));

  // current streak. consecutive days with at least one dictation counting
  // back from the most recent day.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].count > 0) streak += 1;
    else break;
  }

  const level = (count: number): number => {
    if (count <= 0) return 0;
    const q = count / max;
    if (q > 0.75) return 4;
    if (q > 0.5) return 3;
    if (q > 0.25) return 2;
    return 1;
  };

  // pad the front so the first day lands on its weekday row (sunday first),
  // then split into week columns for a github style grid.
  const cells: (DailyBucket | null)[] = [];
  if (days.length > 0) {
    const firstDow = new Date(days[0].day + "T00:00:00").getDay();
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
  }
  for (const d of days) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DailyBucket | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dowLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div className="bg-card border-border rounded-lg border p-[18px]">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold">Activity</div>
        {streak > 0 ? (
          <span className="text-primary flex items-center gap-1.5 rounded-full bg-[hsl(248_53%_58%/0.12)] px-2.5 py-1 text-xs font-medium">
            <Flame className="size-3.5" strokeWidth={2.25} />
            {streak} day{streak === 1 ? "" : "s"} streak
          </span>
        ) : null}
      </div>

      <div className="flex gap-1.5">
        <div className="text-muted-foreground flex w-6 shrink-0 flex-col gap-[2px] text-[9px]">
          {dowLabels.map((l, i) => (
            <span key={i} className="flex flex-1 items-center leading-none">
              {l}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-[2px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-[2px]">
              {week.map((cell, di) => (
                <div
                  key={di}
                  className="aspect-square rounded-[2px]"
                  style={{
                    backgroundColor: cell
                      ? shadeColor(level(cell.count))
                      : "transparent",
                  }}
                  title={cell ? `${cell.count} on ${cell.day}` : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[10px]">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className="size-3 rounded-[2px]"
            style={{ backgroundColor: shadeColor(l) }}
          />
        ))}
        More
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-card border-border flex flex-col rounded-lg border p-[14px]">
      <span className="text-muted-foreground text-xs font-medium tracking-[0.06em] uppercase">
        {label}
      </span>
      <span className="mt-1 text-2xl font-semibold tracking-[-0.01em] tabular-nums">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            {unit}
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground mt-0.5 text-xs">&nbsp;</span>
    </div>
  );
}

function ListCard({
  title,
  entries,
}: {
  title: string;
  entries: { label: string; count: number }[];
}) {
  return (
    <div className="bg-card border-border rounded-lg border py-1">
      <div className="px-4 pt-3 pb-1.5 text-sm font-semibold">{title}</div>
      {entries.map((e, i) => (
        <div
          key={`${e.label}-${i}`}
          className="border-border flex items-center justify-between px-4 py-2 text-sm [&+&]:border-t"
        >
          <span className="truncate">{e.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {e.count}
          </span>
        </div>
      ))}
    </div>
  );
}
