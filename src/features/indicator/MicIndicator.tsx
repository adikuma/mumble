import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import {
  getMeter,
  isTauri,
  type AppState,
  type ChunkProgressEvent,
} from "@/lib/tauri";

// fixed waveform bar count. the design uses 14.
const BARS = 14;

interface MicIndicatorProps {
  state: AppState;
  variant: "light" | "dark";
  /** chunk progress while streaming a long recording. null if single chunk. */
  progress?: ChunkProgressEvent | null;
}

/**
 * recording pill. a refined monochrome capsule with a softly rounded rect
 * body, a glowing record dot, an indigo waveform, and a tabular timer.
 *
 *   * state === "recording" renders the dot, rms driven waveform, and timer.
 *   * state === "idle" keeps the same waveform/timer layout at rest.
 *   * state === "transcribing" renders an indigo spinner and "Transcribing…".
 *   * state === "pasting" renders an indigo spinner and "Pasting…".
 *
 * light pill. soft white gradient, hairline border, lift shadow.
 * dark pill. zinc gradient body, inner top highlight, lift shadow.
 */
export function MicIndicator({
  state,
  variant,
  progress = null,
}: MicIndicatorProps) {
  if (state === "transcribing" || state === "pasting") {
    return <StatusPill state={state} variant={variant} progress={progress} />;
  }
  return <RecordingPill variant={variant} active={state === "recording"} />;
}

function pillClasses(className?: string) {
  return cn(
    "inline-flex items-center gap-2.5 rounded-xl border border-border bg-card py-2 pr-4 pl-3.5 shadow-lg",
    className,
  );
}

function pillStyle(variant: "light" | "dark"): React.CSSProperties {
  // surface and border come from design tokens via tailwind classes on the
  // wrapper. only the text color flips with variant since the indicator is
  // not bound to the page theme.
  if (variant === "light") {
    return {
      color: "hsl(var(--foreground))",
    };
  }
  return {
    color: "hsl(var(--popover-foreground))",
  };
}

function dividerColor(variant: "light" | "dark") {
  return variant === "dark"
    ? "hsl(var(--foreground) / 0.18)"
    : "hsl(var(--foreground) / 0.12)";
}

function RecordingPill({
  variant,
  active,
}: {
  variant: "light" | "dark";
  active: boolean;
}) {
  return (
    <div className={pillClasses()} style={pillStyle(variant)}>
      <span
        className="size-[7px] shrink-0 rounded-full"
        style={{
          background: "hsl(var(--destructive))",
          boxShadow: "0 0 0 4px hsl(var(--destructive) / 0.18)",
        }}
      />
      <Waveform active={active} />
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
        style={{ color: "hsl(var(--primary))" }}
      />
      <span className="text-[13px] font-medium tracking-tight">{label}…</span>
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

function Waveform({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: BARS }, () => 8),
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

    // recursive settimeout so the next getmeter call is only scheduled after
    // the prior one resolves. setinterval would pile up overlapping calls if
    // the backend ever stalled. persistent failures get logged once.
    let cancelled = false;
    let timer: number | null = null;
    let failures = 0;
    let warned = false;

    const tick = () => {
      getMeter()
        .then((rms) => {
          failures = 0;
          if (cancelled) return;
          update(rms);
        })
        .catch(() => {
          failures += 1;
          if (failures >= 5 && !warned) {
            warned = true;
            console.warn("getMeter failing persistently");
          }
        })
        .finally(() => {
          if (cancelled) return;
          timer = window.setTimeout(tick, tickInterval);
        });
    };

    tick();

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [active]);

  // waveform bars use the primary token so the indicator follows the brand
  // accent in both light and dark variants.
  const barBackground = "hsl(var(--primary))";

  return (
    <div className="flex h-4 w-[60px] shrink-0 items-center gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="rounded-[2px] motion-safe:transition-[height] motion-safe:duration-75"
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
