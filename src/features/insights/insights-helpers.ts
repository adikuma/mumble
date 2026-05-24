import type { Transcript } from "@/lib/tauri";

export interface PastedApp {
  name: string;
  path: string | null;
  count: number;
}

// derive the top pasted-into apps straight from the store transcripts, which
// carry the full targetAppPath. the backend insights only returns basenames,
// and get_app_icon needs the full path to extract a real icon.
export function topPastedApps(
  transcripts: Transcript[],
  limit = 8,
): PastedApp[] {
  const map = new Map<string, PastedApp>();
  for (const t of transcripts) {
    const name = t.targetApp;
    if (!name) continue;
    const existing = map.get(name);
    if (existing) {
      existing.count += 1;
      if (!existing.path && t.targetAppPath) existing.path = t.targetAppPath;
    } else {
      map.set(name, { name, path: t.targetAppPath ?? null, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
