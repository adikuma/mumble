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
 * recording pill. a refined monochrome capsule with a softly rounded rect
 * body, a glowing record dot, an indigo waveform, and a tabular timer.
 *
 *   * state === "recording" renders the dot, rms driven waveform, and timer.
 *   * state === "transcribing" renders an indigo spinner and "Transcribing…".
 *   * state === "pasting" renders an indigo spinner and "Pasting…".
 *
 * light pill. soft white gradient, hairline border, lift shadow.
 * dark pill. zinc gradient body, inner top highlight, lift shadow.
 */
export function MicIndicator({
  state,
  variant,
  bars = 14,
  progress = null,
}: MicIndicatorProps) {
  if (state === "transcribing" || state === "pasting") {
    return <StatusPill state={state} variant={variant} progress={progress} />;
  }
  return (
    <RecordingPill
      variant={variant}
      bars={bars}
      active={state === "recording"}
    />
  );
}

function pillClasses(className?: string) {
  return cn(
    "inline-flex items-center gap-2.5 rounded-[12px] py-2 pr-4 pl-3.5",
    className,
  );
}

function pillStyle(variant: "light" | "dark"): React.CSSProperties {
  if (variant === "light") {
    return {
      background: "linear-gradient(180deg, #ffffff 0%, #f7f7f8 100%)",
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow:
        "0 12px 28px -12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.85)",
      color: "var(--foreground)",
    };
  }
  return {
    background: "linear-gradient(180deg, #212126 0%, #161619 100%)",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow:
      "0 14px 32px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07)",
    color: "#fafafa",
  };
}

function dividerColor(variant: "light" | "dark") {
  return variant === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
}

// rms level that counts as the user having started speaking. the live meter
// reports raw input rms, where speech sits around 0.02 and up.
const SPEECH_RMS_THRESHOLD = 0.02;

// detects the first moment the user actually speaks after recording starts so
// the pill can show a clear speak now cue and only reveal the live waveform
// once your voice crosses the meter. resets when recording stops.
function useSpeechDetected(active: boolean): boolean {
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    if (!active) return;

    // browser dev has no real meter. reveal the waveform after a beat so the
    // preview still animates.
    if (!isTauri()) {
      const id = setTimeout(() => setSpoken(true), 600);
      return () => {
        clearTimeout(id);
        setSpoken(false);
      };
    }

    const id = setInterval(() => {
      getMeter()
        .then((rms) => {
          if (rms > SPEECH_RMS_THRESHOLD) setSpoken(true);
        })
        .catch(() => {});
    }, 50);
    return () => {
      clearInterval(id);
      setSpoken(false);
    };
  }, [active]);

  return spoken;
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
  const spoken = useSpeechDetected(active);
  return (
    <div className={pillClasses()} style={pillStyle(variant)}>
      <span
        className="size-[7px] shrink-0 rounded-full"
        style={{
          background: variant === "dark" ? "#f87171" : "#ef4444",
          boxShadow:
            variant === "dark"
              ? "0 0 0 4px rgba(248,113,113,0.18)"
              : "0 0 0 4px rgba(239,68,68,0.14)",
        }}
      />
      {active && !spoken ? (
        <span
          className="shrink-0 text-[12px] font-medium tracking-tight"
          style={{ opacity: 0.85 }}
        >
          Speak now
        </span>
      ) : (
        <Waveform active={active} variant={variant} bars={bars} />
      )}
      <span
        className="h-[15px] w-px shrink-0"
        style={{ background: dividerColor(variant) }}
      />
      <Timer active={active} />
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
    <div className={pillClasses()} style={pillStyle(variant)}>
      <Loader2
        className="size-3.5 shrink-0 animate-spin"
        strokeWidth={2.25}
        style={{ color: variant === "dark" ? "#9c91f5" : "#6d5fe8" }}
      />
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
    <span
      className="shrink-0 tabular-nums"
      style={{ fontSize: 11.5, opacity: 0.8 }}
    >
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

  const barBackground =
    variant === "dark"
      ? "linear-gradient(180deg, #cfc9ff, #9c91f5)"
      : "linear-gradient(180deg, #8b80f0, #6d5fe8)";

  return (
    <div className="flex h-4 w-[60px] shrink-0 items-center gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="rounded-[2px] transition-[height] duration-50"
          style={{
            flex: 1,
            maxWidth: 2,
            minWidth: 2,
            height: `${h}%`,
            background: barBackground,
          }}
        />
      ))}
    </div>
  );
}
