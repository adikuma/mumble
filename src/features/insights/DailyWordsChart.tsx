import { useState } from "react";
import type { Bucket } from "@/features/insights/insights-derive";

// area + line chart of words per bucket with a hover tooltip. fills its
// container; the parent card sets the height.
export function DailyWordsChart({ series }: { series: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // clamp a stale hover index when the series shrinks on range change, else
  // series[hover] is undefined and crashes the render.
  const hovered = hover != null && hover < series.length ? hover : null;

  const W = 520;
  const H = 220;
  const padX = 10;
  const padTop = 16;
  const padBottom = 30;

  const words = series.map((b) => b.words);
  const max = Math.max(...words, 1);
  const n = series.length;
  const stepX = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padTop + (H - padTop - padBottom) * (1 - v / max);

  const line =
    n > 0
      ? words
          .map(
            (v, i) =>
              `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`,
          )
          .join(" ")
      : "";
  const area =
    n > 1
      ? `${line} L${x(n - 1).toFixed(1)} ${H - padBottom} L${x(0).toFixed(1)} ${H - padBottom} Z`
      : "";

  // thin the x labels when there are many buckets (month view).
  const labelEvery = n <= 8 ? 1 : Math.ceil(n / 7);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="dailyWordsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="hsl(var(--primary) / 0.26)" />
            <stop offset="1" stopColor="hsl(var(--primary) / 0)" />
          </linearGradient>
        </defs>

        {area ? <path d={area} fill="url(#dailyWordsFill)" /> : null}
        {line ? (
          <path
            d={line}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {hovered != null ? (
          <circle
            cx={x(hovered)}
            cy={y(words[hovered])}
            r="4.5"
            fill="hsl(var(--primary))"
            stroke="hsl(var(--card))"
            strokeWidth="2.5"
          />
        ) : null}

        {/* hover hit zones */}
        {series.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (stepX || W) / 2}
            y="0"
            width={stepX || W}
            height={H - padBottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* x axis labels */}
        {series.map((b, i) =>
          i % labelEvery === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="hsl(var(--muted-foreground))"
            >
              {b.label}
            </text>
          ) : null,
        )}
      </svg>

      {hovered != null ? (
        <div
          className="bg-foreground text-background pointer-events-none absolute -translate-x-1/2 -translate-y-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap"
          style={{
            left: `${(x(hovered) / W) * 100}%`,
            top: `${(y(words[hovered]) / H) * 100}%`,
          }}
        >
          {series[hovered].label} · {words[hovered]} words
        </div>
      ) : null}
    </div>
  );
}
