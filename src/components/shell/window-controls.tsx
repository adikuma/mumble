import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/tauri";

/**
 * windows style window controls. minimize and maximize hover muted, close
 * hovers destructive with a white icon. close hides to tray, matching the
 * close prevented behavior in lib.rs.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});
    let unlisten: (() => void) | undefined;
    win
      .onResized(() => {
        win
          .isMaximized()
          .then(setMaximized)
          .catch(() => {});
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  function minimize() {
    if (isTauri()) void getCurrentWindow().minimize();
  }
  function toggleMax() {
    if (isTauri()) void getCurrentWindow().toggleMaximize();
  }
  function close() {
    if (isTauri()) void getCurrentWindow().hide();
  }

  return (
    <div
      className="flex h-full items-stretch"
      style={{ ["WebkitAppRegion" as never]: "no-drag" }}
    >
      <CtrlButton onClick={minimize} aria-label="Minimize">
        <Minus className="size-3" strokeWidth={2} />
      </CtrlButton>
      <CtrlButton
        onClick={toggleMax}
        aria-label={maximized ? "Restore" : "Maximize"}
      >
        <Square className="size-[10px]" strokeWidth={2} />
      </CtrlButton>
      <CtrlButton onClick={close} variant="close" aria-label="Hide to tray">
        <X className="size-3" strokeWidth={2} />
      </CtrlButton>
    </div>
  );
}

function CtrlButton({
  children,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "close";
}) {
  return (
    <button
      {...props}
      className={cn(
        "text-muted-foreground flex h-full w-11 items-center justify-center transition-colors",
        variant === "close"
          ? "hover:bg-destructive hover:text-white"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
