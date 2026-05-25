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
import { AppGrid, Page, PageHeader, Surface } from "@/components/kit/layout";
import { AppIcon } from "@/features/history/AppIcon";
import { avgWpmThisWeek } from "@/features/home/home-helpers";
import {
  topPastedApps,
  type PastedApp,
} from "@/features/insights/insights-helpers";

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
  const apps = useMemo(() => topPastedApps(transcripts, 24), [transcripts]);
  const topApps = apps.slice(0, 3);
  const avgWords =
    !empty && data!.sessions > 0 ? Math.round(data!.words / data!.sessions) : 0;
  const dash = "—";

  return (
    <Page>
      <PageHeader
        title="Insights"
        description={
          empty
            ? "Your dictation stats will appear here."
            : `You spoke for ${formatMinutes(data!.timeSavedSec)} this week, across ${data!.sessions} ${data!.sessions === 1 ? "dictation" : "dictations"}.`
        }
      />

      <AppGrid columns="stats" className="mt-6">
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
      </AppGrid>

      <MetricsStrip
        items={[
          { label: "Dictations", value: empty ? dash : data!.sessions },
          { label: "Avg words", value: empty ? dash : avgWords },
          {
            label: "Apps used",
            value: empty ? dash : Math.max(apps.length, data!.topApps.length),
          },
          {
            label: "Avg latency",
            value:
              empty || data!.avgLatencyMs == null
                ? dash
                : `${Math.round(data!.avgLatencyMs)} ms`,
          },
        ]}
      />

      <Heatmap days={heat} />

      <AppGrid className="mt-4">
        <Surface className="min-h-[280px] p-5">
          <div className="mb-3 text-base font-semibold">Top words</div>
          <BarList entries={empty ? [] : data!.topWords} />
        </Surface>
        <Surface className="min-h-[280px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-semibold">Top apps used</span>
            {topApps.length > 0 ? (
              <span className="text-muted-foreground text-[12px] font-semibold tracking-[0.07em] uppercase">
                top {topApps.length}
              </span>
            ) : null}
          </div>
          <TopApps
            apps={topApps}
            total={apps.reduce((n, a) => n + a.count, 0)}
          />
        </Surface>
      </AppGrid>
    </Page>
  );
}

function MetricsStrip({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <Surface className="mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className="border-border px-4 py-4 md:border-l first:md:border-l-0"
            data-index={index}
          >
            <div className="text-muted-foreground text-[12px] font-semibold tracking-[0.07em] uppercase">
              {item.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function TopApps({ apps, total }: { apps: PastedApp[]; total: number }) {
  if (apps.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">No apps yet.</p>;
  }

  return (
    <div className="space-y-4">
      {apps.map((app, index) => {
        const pct = total > 0 ? Math.round((app.count / total) * 100) : 0;
        return (
          <div
            key={app.name}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-4"
          >
            <div className="bg-background flex size-11 items-center justify-center rounded-[10px]">
              <AppIcon exePath={app.path} appName={app.name} size={26} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs tabular-nums">
                  #{index + 1}
                </span>
                <span className="truncate text-sm font-semibold">
                  {app.name}
                </span>
              </div>
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">
                {app.count}
              </div>
              <div className="text-muted-foreground text-xs">{pct}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shadeColor(level: number): string {
  switch (level) {
    case 1:
      return "hsl(var(--primary) / 0.3)";
    case 2:
      return "hsl(var(--primary) / 0.52)";
    case 3:
      return "hsl(var(--primary) / 0.74)";
    case 4:
      return "hsl(var(--primary))";
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
    <Surface className="mt-4 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-base font-semibold">Activity</div>
        {streak > 0 ? (
          <span className="text-primary flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/0.14)] px-2.5 py-1 text-xs font-medium">
            <Flame className="size-3.5" strokeWidth={2.25} />
            {streak} day{streak === 1 ? "" : "s"} streak
          </span>
        ) : null}
      </div>

      <div className="flex gap-1.5">
        <div className="text-muted-foreground flex w-6 shrink-0 flex-col gap-[2px] text-[10px]">
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

      <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[11px]">
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
    </Surface>
  );
}
