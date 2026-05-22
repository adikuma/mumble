import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import {
  getMeter,
  isTauri,
  type AppState,
  type ChunkProgressEvent,
} from "@/lib/tauri";

interface MicIndicatorProps {
  state: AppState;
  variant: "light" | "dark";
  /** number of waveform bars. design uses 14. */
  bars?: number;
  /** chunk progress while streaming a long recording. null if single chunk. */
  progress?: ChunkProgressEvent | null;
}

/**
 * recording pill (design 3 from the claude design output).
 *
 *   * state === "recording" renders red dot, rms driven waveform, tabular timer.
 *   * state === "transcribing" renders spinner and "Transcribing…".
 *   * state === "pasting" renders spinner and "Pasting…".
 *
 * light pill. white bg, hairline border, soft shadow.
 * dark pill. zinc 950 bg, softer shadow, lighter dot.
 */
export function MicIndicator({
  state,
  variant,
  bars = 14,
  progress = null,
}: MicIndicatorProps) {
  if (state === "transcribing" || state === "pasting") {
    return (
      <StatusPill state={state} variant={variant} progress={progress} />
    );
  }
  return (
    <RecordingPill
      variant={variant}
      bars={bars}
      active={state === "recording"}
    />
  );
}

function pillClasses(variant: "light" | "dark", className?: string) {
  return cn(
    "inline-flex items-center gap-2.5 rounded-full pl-3 pr-3.5 py-2",
    variant === "light"
      ? "border-border bg-white border"
      : "border-transparent",
    className,
  );
}

function pillStyle(variant: "light" | "dark"): React.CSSProperties {
  if (variant === "light") {
    return {
      boxShadow:
        "0 8px 22px -10px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.6) inset",
      color: "var(--foreground)",
    };
  }
  return {
    background: "#18181b",
    boxShadow: "0 12px 26px -12px rgba(0,0,0,0.5)",
    color: "#fafafa",
  };
}

function RecordingPill({
  variant,
  bars,
  active,
}: {
  variant: "light" | "dark";
  bars: number;
  active: boolean;
}) {
  return (
    <div className={pillClasses(variant)} style={pillStyle(variant)}>
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{
          background: variant === "dark" ? "#f87171" : "#ef4444",
          animation: active ? "mumble-pulse 1.2s ease-in-out infinite" : "none",
        }}
      />
      <Waveform active={active} variant={variant} bars={bars} />
      <Timer active={active} />
      <style>{`
        @keyframes mumble-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

function StatusPill({
  state,
  variant,
  progress,
}: {
  state: "transcribing" | "pasting";
  variant: "light" | "dark";
  progress: ChunkProgressEvent | null;
}) {
  const base = state === "transcribing" ? "Transcribing" : "Pasting";
  const showProgress = progress && progress.total > 1;
  const label = showProgress
    ? `${base} ${progress.current} / ${progress.total}`
    : base;
  return (
    <div className={pillClasses(variant)} style={pillStyle(variant)}>
      <Loader2 className="size-3.5 shrink-0 animate-spin" strokeWidth={2.25} />
      <span className="text-[12px] font-medium tracking-tight">{label}…</span>
    </div>
  );
}

function Timer({ active }: { active: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  return (
    <span className="shrink-0 tabular-nums opacity-70" style={{ fontSize: 11 }}>
      {formatDuration(active ? seconds : 0)}
    </span>
  );
}

function Waveform({
  active,
  variant,
  bars,
}: {
  active: boolean;
  variant: "light" | "dark";
  bars: number;
}) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: bars }, () => 8),
  );

  useEffect(() => {
    if (!active) return;

    const tickInterval = 50;

    // map rms to bar height percent. speech rms lives in 0.02 to 0.25 with
    // peaks to 0.4. without compression, bars hover in a narrow band and
    // look static. power curve amplifies quiet input and lets the bars
    // visibly breathe with your voice.
    const update = (rms: number) => {
      const safeRms = Math.max(0, Math.min(1, rms));
      const amplified = Math.min(1, Math.pow(safeRms * 4, 0.55));
      const targeted = 5 + amplified * 95;
      setHeights((prev) => [...prev.slice(1), targeted]);
    };

    if (!isTauri()) {
      const id = setInterval(() => {
        // browser dev. simulate speech like envelope
        const noise = 0.05 + Math.random() * 0.25;
        update(noise);
      }, tickInterval);
      return () => clearInterval(id);
    }

    const id = setInterval(() => {
      getMeter()
        .then(update)
        .catch(() => {});
    }, tickInterval);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="flex h-4 w-[60px] shrink-0 items-center gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="rounded-[1px] transition-[height] duration-50"
          style={{
            flex: 1,
            maxWidth: 2,
            minWidth: 2,
            height: `${h}%`,
            background:
              variant === "dark"
                ? "rgba(250,250,250,0.9)"
                : "var(--foreground)",
          }}
        />
      ))}
    </div>
  );
}
