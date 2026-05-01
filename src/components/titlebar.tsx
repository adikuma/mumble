import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/tauri";

interface TitlebarProps {
  title?: string;
}

/**
 * windows style frameless titlebar.
 *
 * layout. title on the left (windows 11 convention. settings, store,
 * file explorer all do this), three controls on the right.
 *
 * controls follow windows 11 idioms.
 *   * 40 by 32 hit area each, slim line art icons (lucide).
 *   * minimize and maximize hover with `bg-muted`.
 *   * close hovers `bg-destructive` with white icon. the canonical
 *     "you're about to close this" cue every windows app uses.
 *   * "close" actually hides to tray, matching the existing
 *     close prevented by rust behavior in lib.rs.
 */
export function Titlebar({ title = "Mumble" }: TitlebarProps) {
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
    if (!isTauri()) return;
    void getCurrentWindow().minimize();
  }
  function toggleMax() {
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize();
  }
  function close() {
    if (!isTauri()) return;
    void getCurrentWindow().hide();
  }

  return (
    <div
      className="bg-sidebar border-border flex h-8 shrink-0 items-center justify-between border-b"
      style={{ ["WebkitAppRegion" as never]: "drag" }}
    >
      <div className="text-muted-foreground pl-3 text-xs font-medium select-none">
        {title}
      </div>
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
    </div>
  );
}

function CtrlButton({
  children,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "close";
}) {
  return (
    <button
      {...props}
      className={cn(
        "text-muted-foreground flex h-full w-10 items-center justify-center transition-colors",
        variant === "close"
          ? "hover:bg-destructive hover:text-white"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
