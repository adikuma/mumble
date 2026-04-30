import { History, Settings as SettingsIcon, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type View = "history" | "settings";

interface SidebarProps {
  view: View;
  onChange: (view: View) => void;
  hotkey: string;
  collapsed?: boolean;
}

const NAV: Array<{ id: View; label: string; icon: typeof History }> = [
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({ view, onChange, hotkey, collapsed }: SidebarProps) {
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "border-sidebar-border bg-sidebar text-sidebar-foreground flex h-full flex-col border-r transition-[width] duration-200",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Mic className="text-foreground h-5 w-5 shrink-0" />
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Mumble</span>
            <span className="text-muted-foreground text-[10px]">v0.1.0</span>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-sidebar-border border-t p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Push-to-talk</span>
            <Badge variant="outline">{hotkey}</Badge>
          </div>
        </div>
      )}
    </aside>
  );
}
