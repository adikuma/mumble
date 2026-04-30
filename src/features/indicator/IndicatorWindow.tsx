import { useEffect, useRef, useState } from "react";
import { MicIndicator } from "./MicIndicator";
import {
  getMeter,
  getState,
  isTauri,
  onStateChanged,
  type AppState,
} from "@/lib/tauri";

/**
 * The content of the standalone `indicator` Tauri window. Subscribes directly
 * to state events (it lives outside the main window's lifecycle) and polls
 * the meter 30× per second while recording.
 */
export function IndicatorWindow() {
  const [state, setState] = useState<AppState>(() =>
    isTauri() ? "idle" : "recording",
  );
  const [seconds, setSeconds] = useState(0);
  const [rms, setRms] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      startedAt.current = performance.now();
      return;
    }

    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const cur = await getState();
        setState(cur);
      } catch {
        // noop
      }
      unlisten = await onStateChanged((e) => setState(e.state));
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (state === "recording") {
      if (startedAt.current == null) startedAt.current = performance.now();
    } else if (state === "idle") {
      startedAt.current = null;
    }
  }, [state]);

  useEffect(() => {
    let frame: number | null = null;
    let meterTimer: number | null = null;
    const tick = () => {
      if (startedAt.current != null) {
        setSeconds(Math.floor((performance.now() - startedAt.current) / 1000));
      } else {
        setSeconds((s) => (s === 0 ? s : 0));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    if (isTauri()) {
      meterTimer = window.setInterval(() => {
        getMeter()
          .then(setRms)
          .catch(() => {});
      }, 40);
    }
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      if (meterTimer != null) clearInterval(meterTimer);
    };
  }, []);

  if (state === "idle" || state === "paused") return null;

  const uiState: "listening" | "transcribing" =
    state === "recording" ? "listening" : "transcribing";

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <MicIndicator state={uiState} seconds={seconds} rms={rms} />
    </div>
  );
}
