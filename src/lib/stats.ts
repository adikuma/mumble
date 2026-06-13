import type { Transcript } from "@/lib/tauri";

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wordsToday(
  transcripts: Transcript[],
  now: Date = new Date(),
): number {
  const today = startOfDay(now);
  return transcripts.reduce(
    (sum, t) =>
      startOfDay(new Date(t.createdAt)) === today
        ? sum + wordCount(t.text)
        : sum,
    0,
  );
}

export function currentStreakDays(
  transcripts: Transcript[],
  now: Date = new Date(),
): number {
  const days = new Set(
    transcripts.map((t) => startOfDay(new Date(t.createdAt))),
  );
  let cursor = startOfDay(now);
  // if there is nothing today yet, count the streak from yesterday so a day
  // still in progress does not read as a broken streak.
  if (!days.has(cursor)) cursor -= MS_PER_DAY;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= MS_PER_DAY;
  }
  return streak;
}

/** average pace across the last `days`, in wpm. null when nothing qualifies. */
export function avgWpm(
  transcripts: Transcript[],
  days: number,
  now: Date = new Date(),
): number | null {
  const cutoff = now.getTime() - days * MS_PER_DAY;
  let words = 0;
  let sec = 0;
  for (const t of transcripts) {
    if (new Date(t.createdAt).getTime() < cutoff) continue;
    if (t.durationSec <= 0) continue;
    words += wordCount(t.text);
    sec += t.durationSec;
  }
  return sec > 0 ? Math.round((words / sec) * 60) : null;
}

/** the fastest single-dictation pace in the last `days`, in wpm. */
export function fastestWpm(
  transcripts: Transcript[],
  days: number,
  now: Date = new Date(),
): number | null {
  const cutoff = now.getTime() - days * MS_PER_DAY;
  let best: number | null = null;
  for (const t of transcripts) {
    if (new Date(t.createdAt).getTime() < cutoff) continue;
    if (t.durationSec <= 0) continue;
    const wpm = (wordCount(t.text) / t.durationSec) * 60;
    if (best == null || wpm > best) best = wpm;
  }
  return best == null ? null : Math.round(best);
}
