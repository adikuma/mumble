import { useEffect, useRef, useState } from "react";

interface MicIndicatorProps {
  state?: "listening" | "transcribing";
  seconds?: number;
  /** 0..1 — when provided, drives the waveform height directly. */
  rms?: number;
}

const BAR_COUNT = 32;

export function MicIndicator({
  state = "listening",
  seconds = 0,
  rms,
}: MicIndicatorProps) {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.1),
  );
  const lastPushed = useRef(0);

  useEffect(() => {
    if (state !== "listening") return;
    const id = setInterval(() => {
      setBars((prev) => {
        const rest = prev.slice(1);
        const energy = rms != null ? Math.min(1, Math.max(0.05, rms * 3.5)) : 0;
        const next = lastPushed.current * 0.5 + energy * 0.5;
        lastPushed.current = next;
        return [...rest, next];
      });
    }, 45);
    return () => clearInterval(id);
  }, [state, rms]);

  const mm = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, "0");

  return (
    <div className="bg-card text-card-foreground border-border flex h-14 w-80 items-center gap-3 rounded-full border px-4">
      <span className="bg-foreground h-2 w-2 shrink-0 rounded-full" />

      <div className="flex h-5 flex-1 items-center gap-[2px]">
        {bars.map((v, i) => (
          <div
            key={i}
            className="bg-foreground/70 w-[2px] rounded-sm transition-[height] duration-75"
            style={{
              height: `${Math.max(8, state === "transcribing" ? 12 : v * 100)}%`,
            }}
          />
        ))}
      </div>

      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {mm}:{ss}
      </span>

      <span className="text-muted-foreground w-20 text-right text-xs">
        {state === "listening" ? "Listening" : "Transcribing"}
      </span>
    </div>
  );
}
