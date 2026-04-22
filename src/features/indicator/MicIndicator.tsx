import { useEffect, useRef, useState } from "react";

interface MicIndicatorProps {
  state?: "listening" | "transcribing";
  seconds?: number;
  live?: boolean;
  /** 0..1 — when provided, drives the waveform height directly. */
  rms?: number;
}

const BAR_COUNT = 32;

export function MicIndicator({
  state = "listening",
  seconds = 3,
  live = true,
  rms,
}: MicIndicatorProps) {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.15 + Math.random() * 0.5),
  );
  const lastPushed = useRef(0);

  useEffect(() => {
    if (!live || state === "transcribing") return;
    const id = setInterval(() => {
      setBars((prev) => {
        const rest = prev.slice(1);
        // Energy level — either real RMS or synthetic wiggle.
        const energy =
          rms != null
            ? Math.min(1, Math.max(0.05, rms * 3.5))
            : 0.2 + Math.random() * 0.7;
        // Smooth to prevent jitter.
        const next = lastPushed.current * 0.4 + energy * 0.6;
        lastPushed.current = next;
        return [...rest, next];
      });
    }, 45);
    return () => clearInterval(id);
  }, [live, state, rms]);

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
