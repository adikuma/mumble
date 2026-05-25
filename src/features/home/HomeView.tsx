import { useEffect, useMemo } from "react";
import { TranscriptAccordion } from "@/features/home/TranscriptAccordion";
import { groupByRecency } from "@/features/history/group-helpers";
import {
  wordsToday,
  avgWpmThisWeek,
  currentStreakDays,
} from "@/features/home/home-helpers";
import { listHistory } from "@/lib/tauri";
import { formatHotkey } from "@/lib/utils";
import { useMumbleStore } from "@/store";

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

  useEffect(() => {
    listHistory().then(setTranscripts);
  }, [setTranscripts]);

  const groups = useMemo(() => groupByRecency(transcripts), [transcripts]);
  const stats = useMemo(
    () => ({
      words: wordsToday(transcripts),
      wpm: avgWpmThisWeek(transcripts),
      streak: currentStreakDays(transcripts),
    }),
    [transcripts],
  );
  const hotkey = formatHotkey(settings?.hotkey ?? "Right Alt");

  async function refresh() {
    setTranscripts(await listHistory());
  }

  return (
    <div className="mx-auto w-full max-w-[880px] px-9 pb-9">
      <div className="sticky top-0 z-10 -mx-9 px-9 pt-9 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
              {greeting()}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Hold <span className="kbd">{hotkey}</span> and speak, anywhere you
              type.
            </p>
          </div>
          <div className="flex gap-7 pt-1">
            <Stat label="Words today" value={stats.words.toLocaleString()} />
            <Stat
              label="Words / min"
              value={stats.wpm == null ? "—" : String(stats.wpm)}
            />
            <Stat label="Streak" value={String(stats.streak)} unit="d" />
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-foreground text-base font-medium">
            No dictations yet
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Hold <span className="kbd">{hotkey}</span> and speak to make your
            first one.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h3 className="text-muted-foreground mt-7 mb-2.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
              {g.key}
            </h3>
            <TranscriptAccordion transcripts={g.items} onChanged={refresh} />
          </section>
        ))
      )}
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
    <div>
      <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.07em] uppercase">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tracking-[-0.01em] tabular-nums">
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
