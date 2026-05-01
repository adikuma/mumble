import { BarChart3, History, Mic, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type View = "history" | "insights" | "settings";

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
}

export function Sidebar({ view, onChange }: SidebarProps) {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-[220px] shrink-0 flex-col border-r">
      <div className="flex items-center gap-2 px-[14px] pt-[14px] pb-3">
        <Mic className="text-foreground size-4 shrink-0" strokeWidth={2} />
        <div className="flex flex-col leading-[1.1]">
          <span className="text-sm font-semibold">Mumble</span>
          <span className="text-muted-foreground text-[10px] tabular-nums">
            v0.1.0
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        <NavItem
          active={view === "history"}
          onClick={() => onChange("history")}
          icon={History}
          label="History"
        />
        <NavItem
          active={view === "insights"}
          onClick={() => onChange("insights")}
          icon={BarChart3}
          label="Insights"
        />
      </nav>

      <div className="border-sidebar-border border-t px-2 py-2">
        <NavItem
          active={view === "settings"}
          onClick={() => onChange("settings")}
          icon={Settings}
          label="Settings"
        />
      </div>
    </aside>
  );
}

function NavItem({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof History;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}
