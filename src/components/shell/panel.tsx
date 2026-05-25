import type { ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelProps {
  children: ReactNode;
  canToggle: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Panel({
  children,
  canToggle,
  collapsed,
  onToggleCollapsed,
}: PanelProps) {
  return (
    <div className="relative mt-0.5 mr-3.5 mb-3.5 ml-0 min-h-0 flex-1">
      {canToggle ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="bg-sidebar text-muted-foreground hover:bg-background hover:text-foreground border-border dark:border-sidebar-border absolute top-1/2 left-0 z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border transition-colors"
        >
          <PanelLeft
            className={cn(
              "size-4 transition-transform",
              collapsed && "rotate-180",
            )}
            strokeWidth={2}
          />
        </button>
      ) : null}
      <div className="bg-background border-sidebar-border relative h-full overflow-hidden rounded-[16px] border">
        <div className="panel-bg pointer-events-none absolute inset-0" />
        <div className="relative h-full overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
