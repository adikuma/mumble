import { useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import {
  getInsights,
  isTauri,
  type DailyBucket,
  type InsightsData,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { StatCard } from "@/components/kit/stat-card";
import { BarList } from "@/components/kit/bar-list";
import { WpmGauge } from "@/components/kit/wpm-gauge";
import { AppIconGrid } from "@/components/kit/app-icon-grid";
import { avgWpmThisWeek } from "@/features/home/home-helpers";
import { topPastedApps } from "@/features/insights/insights-helpers";

// a full year so the contribution heatmap fills the card like github's.
const HEATMAP_DAYS = 364;

function formatMinutes(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} sec`;
  return `${Math.floor(sec / 60)} min`;
}

function formatHoursMinutes(sec: number): string {
  if (sec < 60) return "0:00";
  const totalMins = Math.floor(sec / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `0:${mins.toString().padStart(2, "0")}`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
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
  }, [transcripts.length]);

  const empty = !data || data.sessions === 0;
  const wpm = useMemo(() => avgWpmThisWeek(transcripts), [transcripts]);
  const apps = useMemo(() => topPastedApps(transcripts), [transcripts]);
  const dash = "—";

  return (
    <div className="mx-auto w-full max-w-[1000px] px-9 py-9">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Insights</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        {empty
          ? "Your dictation stats will appear here."
          : `You spoke for ${formatMinutes(data!.timeSavedSec)} this week, across ${data!.sessions} ${data!.sessions === 1 ? "dictation" : "dictations"}.`}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Words / min"
          value={empty || wpm == null ? dash : String(wpm)}
        >
          <WpmGauge wpm={empty ? null : wpm} />
        </StatCard>
        <StatCard
          label="Time saved"
          value={empty ? dash : formatHoursMinutes(data!.timeSavedSec)}
          unit={empty ? undefined : "hr"}
        />
        <StatCard
          label="Total words"
          value={empty ? dash : data!.words.toLocaleString()}
        />
      </div>

      <Heatmap days={heat} />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-accent rounded-2xl p-5">
          <div className="mb-3 text-base font-semibold">Top words</div>
          <BarList entries={empty ? [] : data!.topWords} />
        </div>
        <div className="bg-accent rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-semibold">Where you pasted</span>
            {apps.length > 0 ? (
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.07em] uppercase">
                {apps.length} apps
              </span>
            ) : null}
          </div>
          <AppIconGrid apps={apps} />
        </div>
      </div>
    </div>
  );
}

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
      return "hsl(var(--muted-foreground) / 0.16)";
  }
}

function Heatmap({ days }: { days: DailyBucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));

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
    <div className="bg-accent mt-4 rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-base font-semibold">Activity</div>
        {streak > 0 ? (
          <span className="text-primary flex items-center gap-1.5 rounded-full bg-[hsl(248_53%_58%/0.14)] px-2.5 py-1 text-xs font-medium">
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
