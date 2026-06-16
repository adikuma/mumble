// small ui helpers for the insights dashboard. all aggregation (series,
// heatmap, streak, pace, fastest) now lives in the rust backend so the chart,
// headline and pills cannot disagree. what is left here is range plumbing and
// pure presentation helpers.

import type { Bucket } from "@/lib/tauri";

// re-export so the view components keep importing the shapes from here.
export type { Bucket, HourHeat } from "@/lib/tauri";

export type Range = "day" | "week" | "month";

export function rangeToDays(range: Range): number {
  return range === "day" ? 1 : range === "week" ? 7 : 30;
}

const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
