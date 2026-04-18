import { useEffect, useState } from "react";

interface MicIndicatorProps {
  state?: "listening" | "transcribing";
  seconds?: number;
  live?: boolean;
}

const BAR_COUNT = 32;

export function MicIndicator({
  state = "listening",
  seconds = 3,
  live = true,
}: MicIndicatorProps) {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.2 + Math.random() * 0.6),
  );

  useEffect(() => {
    if (!live || state === "transcribing") return;
    const id = setInterval(() => {
      setBars((prev) =>
        prev.map((v) => {
          const target = 0.15 + Math.random() * 0.85;
          return v * 0.6 + target * 0.4;
        }),
      );
    }, 70);
    return () => clearInterval(id);
  }, [live, state]);

  const mm = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, "0");

  return (
    <div
      className="border-border bg-card/90 flex h-16 w-80 items-center gap-3 rounded-full border px-4 shadow-md backdrop-blur"
      style={{
        boxShadow:
          "0 8px 24px color-mix(in srgb, var(--foreground) 20%, transparent)",
      }}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          state === "listening" ? "bg-brand" : "bg-muted-foreground"
        } ${state === "listening" ? "animate-pulse" : ""}`}
      />

      <div className="flex h-6 flex-1 items-center gap-[2px]">
        {bars.map((v, i) => (
          <div
            key={i}
            className="bg-foreground/80 w-[2px] rounded-sm transition-[height]"
            style={{
              height: `${Math.max(6, state === "transcribing" ? 10 : v * 100)}%`,
            }}
          />
        ))}
      </div>

      <span className="text-muted-foreground font-mono text-[13px] tabular-nums">
        {mm}:{ss}
      </span>

      <span className="text-muted-foreground w-[80px] text-right text-[11px]">
        {state === "listening" ? "Listening" : "Transcribing…"}
      </span>
    </div>
  );
}
