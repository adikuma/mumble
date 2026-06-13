import { useEffect, useMemo, useState } from "react";
import {
  getInsights,
  isTauri,
  type InsightsData,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { BarList } from "@/components/kit/bar-list";
import { AppGrid, CardHeader, Page, PageHeader, Surface } from "@/components/kit/layout";
import { avgWpm, currentStreakDays, fastestWpm } from "@/lib/stats";
import { useNow } from "@/lib/use-now";
import {
  buildSeries,
  hourWeekdayBuckets,
  rangeLabel,
  rangeToDays,
  sparkPoints,
  type Range,
} from "@/features/insights/insights-derive";
import { RangeToggle } from "@/features/insights/RangeToggle";
import { StreakPill } from "@/features/insights/StreakPill";
import { SummaryStrip } from "@/features/insights/SummaryStrip";
import { DailyWordsChart } from "@/features/insights/DailyWordsChart";
import { SpeakingPaceCard } from "@/features/insights/SpeakingPaceCard";
import { HourHeatmap } from "@/features/insights/HourHeatmap";

const DASH = "—";

const PERIOD_TITLE: Record<Range, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

const PERIOD_WORD: Record<Range, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

export function InsightsView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const [range, setRange] = useState<Range>("week");
  const [data, setData] = useState<InsightsData | null>(null);

  const days = rangeToDays(range);
  // ticking clock so day buckets and labels do not freeze at the mount-time
  // boundary in the always-mounted tray window.
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const label = rangeLabel(range, now);

  useEffect(() => {
    if (!isTauri()) return;
    let stale = false;
    getInsights(days)
      .then((d) => {
        // drop the response if the range changed while it was in flight.
        if (!stale) setData(d);
      })
      .catch((e) => console.error("getInsights failed", e));
    return () => {
      stale = true;
    };
  }, [transcripts, days]);

  const empty = !data || data.sessions === 0;

  const series = useMemo(
    () => buildSeries(transcripts, range, now),
    [transcripts, range, now],
  );
  const streak = useMemo(
    () => currentStreakDays(transcripts, now),
    [transcripts, now],
  );
  const pace = useMemo(
    () => avgWpm(transcripts, days, now),
    [transcripts, days, now],
  );
  const fastest = useMemo(
    () => fastestWpm(transcripts, days, now),
    [transcripts, days, now],
  );
  const heat = useMemo(
    () => hourWeekdayBuckets(transcripts, now),
    [transcripts, now],
  );

  const words = data?.words ?? 0;
  const sessions = data?.sessions ?? 0;
  const timeSavedMin = data ? Math.round(data.timeSavedSec / 60) : 0;
  const latency = data?.avgLatencyMs ?? null;
  const topWords = (data?.topWords ?? []).slice(0, 6);

  const summaryStats = [
    {
      label: "Words",
      value: empty ? DASH : words.toLocaleString(),
      points: sparkPoints(series, "words"),
    },
    {
      label: "Dictations",
      value: empty ? DASH : String(sessions),
      points: sparkPoints(series, "dictations"),
    },
    {
      label: "Time saved",
      value: empty ? DASH : String(timeSavedMin),
      unit: empty ? undefined : "min",
      points: sparkPoints(series, "durationSec"),
    },
    {
      label: "Pace",
      value: empty || pace == null ? DASH : String(pace),
      unit: empty || pace == null ? undefined : "wpm",
      points: sparkPoints(series, "wpm"),
    },
    {
      label: "Latency",
      value: empty || latency == null ? DASH : String(latency),
      unit: empty || latency == null ? undefined : "ms",
      points: sparkPoints(series, "latencyMs"),
    },
  ];

  const subtitle = empty
    ? "Your dictation stats will appear here."
    : `${words.toLocaleString()} words across ${sessions} ${sessions === 1 ? "dictation" : "dictations"} ${PERIOD_WORD[range]}.`;

  return (
    <Page className="max-w-[960px]">
      <PageHeader
        title="Insights"
        description={subtitle}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StreakPill days={streak} />
            <RangeToggle value={range} onChange={setRange} />
          </div>
        }
      />

      <div className="mt-6 flex flex-col gap-4">
        <SummaryStrip
          title={PERIOD_TITLE[range]}
          dateLabel={label}
          stats={summaryStats}
        />

        <AppGrid>
          <Surface className="p-5">
            <CardHeader title="Daily words" meta={label} />
            <DailyWordsChart series={series} />
          </Surface>

          <Surface className="p-5">
            <CardHeader title="Speaking pace" />
            <SpeakingPaceCard
              wpm={empty ? null : pace}
              fastest={empty ? null : fastest}
              latencyMs={empty ? null : latency}
            />
          </Surface>
        </AppGrid>

        <AppGrid>
          <Surface className="p-5">
            <CardHeader title="Activity" meta="by hour · 7 days" />
            <HourHeatmap data={heat} />
          </Surface>

          <Surface className="p-5">
            <CardHeader title="Top words" meta="stopwords excluded" />
            <BarList entries={topWords} />
          </Surface>
        </AppGrid>
      </div>
    </Page>
  );
}
