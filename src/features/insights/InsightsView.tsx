import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { getInsights, isTauri, type InsightsData } from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { BarList } from "@/components/kit/bar-list";
import {
  AppGrid,
  CardHeader,
  Page,
  PageHeader,
  Surface,
} from "@/components/kit/layout";
import { formatHotkey } from "@/lib/utils";
import { useNow } from "@/lib/use-now";
import {
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
  const settings = useMumbleStore((s) => s.settings);
  const [range, setRange] = useState<Range>("week");
  const [data, setData] = useState<InsightsData | null>(null);

  const days = rangeToDays(range);
  // ticking clock so the date label does not freeze at the mount-time
  // boundary in the always-mounted tray window. the heavy aggregation is now
  // backend owned, so this only drives the header label.
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const label = rangeLabel(range, now);
  const hotkey = formatHotkey(settings?.hotkey ?? "Right Alt");

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

  // everything below reads straight from the backend response so the headline,
  // chart, heatmap, streak and pace can never disagree on screen.
  const series = data?.series ?? [];
  const heat = data?.heatmap ?? { matrix: [], max: 0 };
  const streak = data?.streak ?? 0;
  const pace = data?.pace ?? null;
  const fastest = data?.fastest ?? null;

  const words = data?.words ?? 0;
  const sessions = data?.sessions ?? 0;
  const timeSavedMin = data ? Math.round(data.timeSavedSec / 60) : 0;
  const latency = data?.avgLatencyMs ?? null;
  const topWords = (data?.topWords ?? []).slice(0, 6);

  if (empty) {
    return (
      <Page className="max-w-[960px]">
        <PageHeader
          title="Insights"
          description="Your dictation stats will appear here."
          actions={<RangeToggle value={range} onChange={setRange} />}
        />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart3
            className="text-muted-foreground/60 size-10"
            strokeWidth={1.5}
          />
          <p className="text-foreground mt-4 text-base font-medium">
            Your insights appear after your first dictation
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Hold <span className="kbd">{hotkey}</span> to get started.
          </p>
        </div>
      </Page>
    );
  }

  const summaryStats = [
    {
      label: "Words",
      value: words.toLocaleString(),
      points: sparkPoints(series, "words"),
    },
    {
      label: "Dictations",
      value: String(sessions),
      points: sparkPoints(series, "dictations"),
    },
    {
      label: "Time saved",
      value: String(timeSavedMin),
      unit: "min",
      points: sparkPoints(series, "durationSec"),
    },
    {
      label: "Pace",
      value: pace == null ? DASH : String(pace),
      unit: pace == null ? undefined : "wpm",
      points: sparkPoints(series, "wpm"),
    },
    {
      label: "Latency",
      value: latency == null ? DASH : String(latency),
      unit: latency == null ? undefined : "ms",
      points: sparkPoints(series, "latencyMs"),
    },
  ];

  const subtitle = `${words.toLocaleString()} words across ${sessions} ${sessions === 1 ? "dictation" : "dictations"} ${PERIOD_WORD[range]}.`;

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
              wpm={pace}
              fastest={fastest}
              latencyMs={latency}
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
