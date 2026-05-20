import { Settings as SettingsIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type View = "history" | "insights" | "settings";

interface TabBarProps {
  view: View;
  onChange: (v: View) => void;
  historyCount: number;
}

export function TabBar({ view, onChange, historyCount }: TabBarProps) {
  return (
    <div className="bg-background flex h-[52px] shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-3">
      <div className="flex items-center gap-3">
        <Logo size={22} className="ml-1" />
        <div className="bg-[hsl(var(--muted))] flex gap-0.5 rounded-[10px] p-[3px]">
          <SegTab active={view === "history"} onClick={() => onChange("history")}>
            History
            <span className="bg-[hsl(var(--background))] text-muted-foreground rounded-[5px] px-[5px] py-[1px] text-[11px] font-medium tabular-nums">
              {historyCount}
            </span>
          </SegTab>
          <SegTab active={view === "insights"} onClick={() => onChange("insights")}>
            Insights
          </SegTab>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => onChange("settings")}
          aria-label="Settings"
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-muted-foreground transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground",
            view === "settings" && "bg-[hsl(var(--accent))] text-foreground",
          )}
        >
          <SettingsIcon className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-[7px] px-[15px] py-[6px] text-[13.5px] font-medium transition-colors",
        active
          ? "bg-[hsl(var(--background))] text-foreground font-semibold shadow-[0_1px_2px_hsl(0_0%_0%/0.12)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
