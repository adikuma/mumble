import { PanelLeft } from "lucide-react";
import { WindowControls } from "@/components/shell/window-controls";
import { cn } from "@/lib/utils";

interface TopbarProps {
  onToggleSidebar: () => void;
  canToggle: boolean;
}

export function Topbar({ onToggleSidebar, canToggle }: TopbarProps) {
  return (
    <div
      className="flex h-[46px] shrink-0 items-center justify-between pl-2"
      style={{ ["WebkitAppRegion" as never]: "drag" }}
    >
      <button
        onClick={onToggleSidebar}
        disabled={!canToggle}
        aria-label="Toggle sidebar"
        aria-disabled={!canToggle}
        className={cn(
          "flex size-8 items-center justify-center rounded-[8px] transition-colors",
          canToggle
            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
            : "text-muted-foreground/40 cursor-default",
        )}
        style={{ ["WebkitAppRegion" as never]: "no-drag" }}
      >
        <PanelLeft className="size-[18px]" strokeWidth={1.8} />
      </button>
      <div
        className="flex h-full items-center"
        style={{ ["WebkitAppRegion" as never]: "no-drag" }}
      >
        <WindowControls />
      </div>
    </div>
  );
}
