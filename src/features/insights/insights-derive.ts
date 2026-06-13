// pure derivations for the insights dashboard, computed from the transcripts
// store slice so the page does not need new backend queries. each function is
// side-effect free and unit-testable.

import type { Transcript } from "@/lib/tauri";
import { MS_PER_DAY, startOfDay, wordCount } from "@/lib/stats";

export type Range = "day" | "week" | "month";

export function rangeToDays(range: Range): number {
  return range === "day" ? 1 : range === "week" ? 7 : 30;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** one point on the trend axis (a day, or an hour for the Day range). */
export interface Bucket {
  label: string; // axis label
  words: number;
  dictations: number;
  durationSec: number; // seconds spoken == backend "time saved"
  wpm: number | null;
  latencyMs: number | null;
}

interface Accum {
  words: number;
  dictations: number;
  durationSec: number;
  latencySum: number;
  latencyN: number;
}

function emptyAccum(): Accum {
  return { words: 0, dictations: 0, durationSec: 0, latencySum: 0, latencyN: 0 };
}

function add(acc: Accum, t: Transcript): void {
  acc.words += wordCount(t.text);
  acc.dictations += 1;
  acc.durationSec += t.durationSec;
  if (t.latencyMs != null) {
    acc.latencySum += t.latencyMs;
    acc.latencyN += 1;
  }
}

function finalize(label: string, acc: Accum): Bucket {
  return {
    label,
    words: acc.words,
    dictations: acc.dictations,
    durationSec: acc.durationSec,
    wpm: acc.durationSec > 0 ? Math.round((acc.words / acc.durationSec) * 60) : null,
    latencyMs: acc.latencyN > 0 ? Math.round(acc.latencySum / acc.latencyN) : null,
  };
}

/**
 * bucket transcripts across the selected range. Day -> 24 hourly buckets for
 * today; Week -> last 7 days; Month -> last 30 days. Buckets are zero-filled so
 * the trend has a continuous x-axis.
 */
export function buildSeries(
  transcripts: Transcript[],
  range: Range,
  now: Date = new Date(),
): Bucket[] {
  if (range === "day") {
    const buckets: Accum[] = Array.from({ length: 24 }, emptyAccum);
    const today = startOfDay(now);
    for (const t of transcripts) {
      const d = new Date(t.createdAt);
      if (startOfDay(d) !== today) continue;
      add(buckets[d.getHours()], t);
    }
    return buckets.map((acc, h) => {
      const label = h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
      return finalize(label, acc);
    });
  }

  const days = rangeToDays(range);
  const buckets: Accum[] = Array.from({ length: days }, emptyAccum);
  const labels: string[] = [];
  const startKeys: number[] = [];
  const todayStart = startOfDay(now);
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = todayStart - i * MS_PER_DAY;
    startKeys.push(dayStart);
    const d = new Date(dayStart);
    labels.push(range === "week" ? WEEKDAY[d.getDay()] : String(d.getDate()));
  }
  const indexByDay = new Map(startKeys.map((k, i) => [k, i]));
  for (const t of transcripts) {
    const key = startOfDay(new Date(t.createdAt));
    const idx = indexByDay.get(key);
    if (idx === undefined) continue;
    add(buckets[idx], t);
  }
  return buckets.map((acc, i) => finalize(labels[i], acc));
}

export interface HourHeat {
  matrix: number[][]; // 7 rows (Mon..Sun) x 24 cols (0..23), dictation counts
  max: number;
}

/** dictation intensity by weekday (Mon..Sun) and hour-of-day over the last 7 days. */
export function hourWeekdayBuckets(
  transcripts: Transcript[],
  now: Date = new Date(),
): HourHeat {
  // rows Mon..Sun for a natural top-to-bottom reading.
  const matrix: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  const cutoff = now.getTime() - 7 * MS_PER_DAY;
  let max = 0;
  for (const t of transcripts) {
    const d = new Date(t.createdAt);
    if (d.getTime() < cutoff) continue;
    // map js getDay (0=Sun..6=Sat) to row 0=Mon..6=Sun.
    const row = (d.getDay() + 6) % 7;
    const col = d.getHours();
    matrix[row][col] += 1;
    if (matrix[row][col] > max) max = matrix[row][col];
  }
  return { matrix, max };
}

/** "May 18 – 24, 2026" style label for the selected range ending today. */
export function rangeLabel(range: Range, now: Date = new Date()): string {
  if (range === "day") {
    return `${MONTH[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  }
  const days = rangeToDays(range);
  const end = now;
  const start = new Date(now.getTime() - (days - 1) * MS_PER_DAY);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = `${MONTH[start.getMonth()]} ${start.getDate()}`;
  const endStr = sameMonth
    ? `${end.getDate()}`
    : `${MONTH[end.getMonth()]} ${end.getDate()}`;
  return `${startStr} – ${endStr}, ${end.getFullYear()}`;
}

/** extract a metric column from the series for a sparkline. */
export function sparkPoints(series: Bucket[], key: keyof Bucket): number[] {
  return series.map((b) => {
    const v = b[key];
    return typeof v === "number" ? v : 0;
  });
}
