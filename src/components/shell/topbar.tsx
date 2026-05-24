import { PanelLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WindowControls } from "@/components/shell/window-controls";

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <div
      className="flex h-[46px] shrink-0 items-center justify-between pl-2"
      style={{ ["WebkitAppRegion" as never]: "drag" }}
    >
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 items-center justify-center rounded-[9px] transition-colors"
        style={{ ["WebkitAppRegion" as never]: "no-drag" }}
      >
        <PanelLeft className="size-[18px]" strokeWidth={1.8} />
      </button>
      <div
        className="flex h-full items-center gap-1"
        style={{ ["WebkitAppRegion" as never]: "no-drag" }}
      >
        <ThemeToggle />
        <WindowControls />
      </div>
    </div>
  );
}
