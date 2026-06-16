import { describe, it, expect } from "vitest";
import type { Bucket } from "@/lib/tauri";
import {
  rangeLabel,
  rangeToDays,
  sparkPoints,
  type Range,
} from "@/features/insights/insights-derive";

function bucket(over: Partial<Bucket>): Bucket {
  return {
    label: "x",
    words: 0,
    dictations: 0,
    durationSec: 0,
    wpm: null,
    latencyMs: null,
    ...over,
  };
}

describe("rangeToDays", () => {
  it("maps each range to its day count", () => {
    expect(rangeToDays("day")).toBe(1);
    expect(rangeToDays("week")).toBe(7);
    expect(rangeToDays("month")).toBe(30);
  });
});

describe("rangeLabel", () => {
  // local time constructor so getMonth and getDate match the assertions.
  const NOW = new Date(2026, 4, 24, 12, 0, 0); // may 24 2026

  it("renders a single day label for the day range", () => {
    expect(rangeLabel("day", NOW)).toBe("May 24, 2026");
  });

  it("renders a same month span for the week range", () => {
    // week ends may 24 and starts may 18 (6 days earlier).
    expect(rangeLabel("week", NOW)).toBe("May 18 – 24, 2026");
  });

  it("renders a cross month span when the range crosses a boundary", () => {
    const now = new Date(2026, 5, 3, 12, 0, 0); // jun 3 2026
    // month range is 30 days so it starts in may and ends in june.
    expect(rangeLabel("month", now)).toBe("May 5 – Jun 3, 2026");
  });
});

describe("sparkPoints", () => {
  it("extracts a numeric metric column from the series", () => {
    const series: Bucket[] = [
      bucket({ words: 10 }),
      bucket({ words: 20 }),
      bucket({ words: 30 }),
    ];
    expect(sparkPoints(series, "words")).toEqual([10, 20, 30]);
  });

  it("coerces null metric values to 0", () => {
    const series: Bucket[] = [
      bucket({ wpm: 80 }),
      bucket({ wpm: null }),
      bucket({ wpm: 120 }),
    ];
    expect(sparkPoints(series, "wpm")).toEqual([80, 0, 120]);
  });

  it("returns an empty array for an empty series", () => {
    const empty: Bucket[] = [];
    expect(sparkPoints(empty, "words")).toEqual([]);
  });
});

// keep the Range type referenced so the import is not flagged as unused.
const SAMPLE_RANGE: Range = "week";
describe("Range type", () => {
  it("is one of the supported range values", () => {
    expect(rangeToDays(SAMPLE_RANGE)).toBe(7);
  });
});
