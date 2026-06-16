import { describe, it, expect } from "vitest";
import type { Transcript } from "@/lib/tauri";
import { avgWpm, currentStreakDays, fastestWpm, wordsToday } from "@/lib/stats";

// fixed clock so every assertion is deterministic regardless of when tests run.
const NOW = new Date("2026-06-17T12:00:00");

// build a transcript with only the fields these pure functions read.
function tx(
  createdAt: string,
  text: string,
  durationSec: number,
  id = createdAt,
): Transcript {
  return {
    id,
    createdAt,
    durationSec,
    text,
    inputDevice: null,
    model: "test",
  };
}

// same calendar day as NOW but at a different clock time.
function atDay(daysAgo: number, hour = 9): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("wordsToday", () => {
  it("sums word counts only for transcripts dated today", () => {
    const transcripts = [
      tx(atDay(0), "one two three", 5),
      tx(atDay(0, 18), "four five", 3),
      tx(atDay(1), "yesterday words ignored", 4),
    ];
    expect(wordsToday(transcripts, NOW)).toBe(5);
  });

  it("returns 0 when nothing was dictated today", () => {
    const transcripts = [tx(atDay(2), "old text here", 4)];
    expect(wordsToday(transcripts, NOW)).toBe(0);
  });
});

describe("currentStreakDays", () => {
  it("counts consecutive days ending today", () => {
    const transcripts = [
      tx(atDay(0), "today", 2),
      tx(atDay(1), "yesterday", 2),
      tx(atDay(2), "two days ago", 2),
    ];
    expect(currentStreakDays(transcripts, NOW)).toBe(3);
  });

  it("stops counting at a gap in the streak", () => {
    const transcripts = [
      tx(atDay(0), "today", 2),
      tx(atDay(1), "yesterday", 2),
      // gap at day 2, then activity resumes earlier and should not count.
      tx(atDay(3), "older", 2),
      tx(atDay(4), "older still", 2),
    ];
    expect(currentStreakDays(transcripts, NOW)).toBe(2);
  });

  it("still counts the streak when today has not been dictated yet", () => {
    const transcripts = [
      tx(atDay(1), "yesterday", 2),
      tx(atDay(2), "two days ago", 2),
    ];
    // today in progress should not read as broken, so streak runs from yesterday.
    expect(currentStreakDays(transcripts, NOW)).toBe(2);
  });

  it("returns 0 when there is no recent activity at all", () => {
    const transcripts = [tx(atDay(5), "long ago", 2)];
    expect(currentStreakDays(transcripts, NOW)).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(currentStreakDays([], NOW)).toBe(0);
  });
});

describe("avgWpm", () => {
  it("computes rounded average pace across the window", () => {
    // 60 words over 60 seconds is exactly 60 wpm.
    const transcripts = [
      tx(atDay(0), Array(30).fill("w").join(" "), 30),
      tx(atDay(1), Array(30).fill("w").join(" "), 30),
    ];
    expect(avgWpm(transcripts, 7, NOW)).toBe(60);
  });

  it("skips zero and negative duration transcripts", () => {
    // the 100 word zero duration entry must not inflate or divide by zero.
    const transcripts = [
      tx(atDay(0), Array(100).fill("w").join(" "), 0),
      tx(atDay(0), Array(30).fill("w").join(" "), 30, "real"),
    ];
    expect(avgWpm(transcripts, 7, NOW)).toBe(60);
  });

  it("returns null when nothing qualifies", () => {
    expect(avgWpm([], 7, NOW)).toBeNull();
    // outside the window so it is excluded, leaving no qualifying data.
    expect(avgWpm([tx(atDay(20), "too old", 30)], 7, NOW)).toBeNull();
  });
});

describe("fastestWpm", () => {
  it("returns the fastest single dictation pace in the window", () => {
    const transcripts = [
      // 30 words / 30s = 60 wpm
      tx(atDay(0), Array(30).fill("w").join(" "), 30),
      // 40 words / 20s = 120 wpm (fastest)
      tx(atDay(1), Array(40).fill("w").join(" "), 20, "fast"),
    ];
    expect(fastestWpm(transcripts, 7, NOW)).toBe(120);
  });

  it("returns null when nothing qualifies", () => {
    expect(fastestWpm([], 7, NOW)).toBeNull();
  });
});
