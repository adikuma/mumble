import { useEffect, useState } from "react";
import { MicIndicator } from "@/features/indicator/MicIndicator";
import { onStateChanged, type AppState } from "@/lib/tauri";
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
  const { theme } = useTheme();

  const effectiveTheme: "light" | "dark" =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  // make the indicator route's window itself transparent.
  useEffect(() => {
    document.body.classList.add("indicator-window");
    return () => document.body.classList.remove("indicator-window");
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onStateChanged((e) => setState(e.state)).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      style={{ fontFamily: "var(--font-sans)", background: "transparent" }}
    >
      <MicIndicator state={state} variant={effectiveTheme} />
    </div>
  );
}
