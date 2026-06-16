import { describe, it, expect } from "vitest";
import type { Transcript } from "@/lib/tauri";
import { groupByRecency } from "@/lib/transcripts";

const NOW = new Date("2026-06-17T12:00:00");

function tx(createdAt: string, id = createdAt): Transcript {
  return {
    id,
    createdAt,
    durationSec: 5,
    text: "sample",
    inputDevice: null,
    model: "test",
  };
}

// same calendar day as NOW shifted by daysAgo, at a fixed clock time.
function atDay(daysAgo: number, hour = 9): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("groupByRecency", () => {
  it("buckets transcripts into Today, Yesterday and Earlier", () => {
    const today = tx(atDay(0), "today");
    const yesterday = tx(atDay(1), "yesterday");
    const earlier = tx(atDay(5), "earlier");
    const groups = groupByRecency([today, yesterday, earlier], NOW);

    expect(groups.map((g) => g.key)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(groups[0].items).toEqual([today]);
    expect(groups[1].items).toEqual([yesterday]);
    expect(groups[2].items).toEqual([earlier]);
  });

  it("omits empty buckets and preserves group order", () => {
    const today = tx(atDay(0), "today");
    const earlier = tx(atDay(3), "earlier");
    const groups = groupByRecency([earlier, today], NOW);

    // no yesterday item so that bucket is dropped, today still comes first.
    expect(groups.map((g) => g.key)).toEqual(["Today", "Earlier"]);
  });

  it("returns an empty array for no transcripts", () => {
    expect(groupByRecency([], NOW)).toEqual([]);
  });

  it("keeps multiple items inside the same bucket", () => {
    const a = tx(atDay(0, 8), "a");
    const b = tx(atDay(0, 20), "b");
    const groups = groupByRecency([a, b], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("Today");
    expect(groups[0].items).toEqual([a, b]);
  });
});
