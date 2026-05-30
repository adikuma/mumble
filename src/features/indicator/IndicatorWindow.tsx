import { useEffect, useState } from "react";
import { MicIndicator } from "@/features/indicator/MicIndicator";
import {
  onChunkProgress,
  onStateChanged,
  type AppState,
  type ChunkProgressEvent,
} from "@/lib/tauri";
import { useTheme } from "@/components/theme-provider";

/**
 * standalone window rendered at `#/indicator` per `tauri.conf.json`.
 *
 * tauri sets the window itself to transparent, but we have to also force
 * `html`, `body`, and `#root` to transparent to actually let the desktop
 * show through. otherwise the global body background paints right through
 * the "transparent" window. we do that by toggling a class on `body` on
 * mount.
 */
export function IndicatorWindow() {
  const [state, setState] = useState<AppState>("idle");
  const [progress, setProgress] = useState<ChunkProgressEvent | null>(null);
  const { resolvedTheme } = useTheme();

  // make the indicator route's window itself transparent.
  useEffect(() => {
    document.body.classList.add("indicator-window");
    return () => document.body.classList.remove("indicator-window");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const guard = (u: () => void) => {
      if (cancelled) u();
      else unlisteners.push(u);
    };

    (async () => {
      const stateUnlisten = await onStateChanged((e) => {
        setState(e.state);
        // reset progress when the pipeline returns to idle so the next
        // recording starts with a clean "transcribing..." label.
        if (e.state === "idle" || e.state === "recording") {
          setProgress(null);
        }
      });
      guard(stateUnlisten);

      const progressUnlisten = await onChunkProgress((e) => setProgress(e));
      guard(progressUnlisten);
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      style={{ fontFamily: "var(--font-sans)", background: "transparent" }}
    >
      <MicIndicator state={state} variant={resolvedTheme} progress={progress} />
    </div>
  );
}
