import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TranscriptAccordion } from "@/features/home/TranscriptAccordion";
import { groupByRecency } from "@/lib/transcripts";
import { wordsToday, avgWpm, currentStreakDays } from "@/lib/stats";
import { isTauri, listHistory } from "@/lib/tauri";
import { formatHotkey } from "@/lib/utils";
import { useMumbleStore } from "@/store";
import {
  MetaLabel,
  Page,
  PageHeader,
  SectionLabel,
} from "@/components/kit/layout";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const setTranscripts = useMumbleStore((s) => s.setTranscripts);
  const settings = useMumbleStore((s) => s.settings);
  const modelReady = useMumbleStore((s) => s.modelReady);
  const downloadProgress = useMumbleStore((s) => s.downloadProgress);

  // capture the greeting once on mount so render stays pure across rerenders.
  // the bridge already loads history on mount, so home only refreshes after
  // local edits via refresh().
  const [hello] = useState<string>(() => greeting());

  const groups = useMemo(() => groupByRecency(transcripts), [transcripts]);
  const stats = useMemo(
    () => ({
      words: wordsToday(transcripts),
      wpm: avgWpm(transcripts, 7),
      streak: currentStreakDays(transcripts),
    }),
    [transcripts],
  );
  const hotkey = formatHotkey(settings?.hotkey ?? "Right Alt");

  // modelReady starts null until the bridge checks status, so only treat the
  // model as missing once we know it is not present.
  const modelMissing = modelReady === false;
  const downloadPct =
    downloadProgress && downloadProgress.total > 0
      ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
      : null;

  const dictateHint = (
    <>
      Hold <span className="kbd">{hotkey}</span> to dictate.
    </>
  );
  const downloadHint =
    downloadPct == null
      ? "Downloading speech model…"
      : `Downloading speech model… ${downloadPct}%`;

  async function refresh() {
    if (!isTauri()) return;
    try {
      setTranscripts(await listHistory());
    } catch (err) {
      toast.error(`Refresh failed: ${(err as Error).message}`);
    }
  }

  return (
    <Page>
      <PageHeader
        title={hello}
        description={modelMissing ? downloadHint : dictateHint}
        actions={
          <div className="flex gap-7 pt-1">
            <Stat label="Words today" value={stats.words.toLocaleString()} />
            <Stat
              label="Words / min"
              value={stats.wpm == null ? "—" : String(stats.wpm)}
            />
            <Stat label="Streak" value={String(stats.streak)} unit="d" />
          </div>
        }
      />

      {modelMissing ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-foreground text-base font-medium">
            Setting up speech model
          </p>
          <p className="text-muted-foreground mt-2 text-sm tabular-nums">
            {downloadHint}
          </p>
          <p className="text-muted-foreground/80 mt-1 text-xs">
            This one time download is about 670 MB. Dictation unlocks when it
            finishes.
          </p>
          <div className="bg-muted mt-5 h-1.5 w-56 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-300"
              style={{ width: `${downloadPct ?? 5}%` }}
            />
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-foreground text-base font-medium">
            No dictations yet
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Hold <span className="kbd">{hotkey}</span> for your first dictation.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <SectionLabel className="mt-7 mb-2.5">{g.key}</SectionLabel>
            <TranscriptAccordion transcripts={g.items} onChanged={refresh} />
          </section>
        ))
      )}
    </Page>
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
    <div>
      <MetaLabel>{label}</MetaLabel>
      <div className="text-stat mt-1.5 font-semibold tabular-nums">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-0.5 text-sm font-normal">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
