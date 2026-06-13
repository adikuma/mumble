import type { Transcript } from "@/lib/tauri";
import { MS_PER_DAY, startOfDay } from "@/lib/stats";

export type GroupKey = "Today" | "Yesterday" | "Earlier";

export interface TranscriptGroup {
  key: GroupKey;
  items: Transcript[];
}

export function groupByRecency(
  transcripts: Transcript[],
  now: Date = new Date(),
): TranscriptGroup[] {
  const today = startOfDay(now);
  const yesterday = today - MS_PER_DAY;

  const buckets: Record<GroupKey, Transcript[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  for (const t of transcripts) {
    const ts = startOfDay(new Date(t.createdAt));
    if (ts === today) buckets.Today.push(t);
    else if (ts === yesterday) buckets.Yesterday.push(t);
    else buckets.Earlier.push(t);
  }

  const out: TranscriptGroup[] = [];
  for (const key of ["Today", "Yesterday", "Earlier"] as const) {
    if (buckets[key].length) out.push({ key, items: buckets[key] });
  }
  return out;
}
