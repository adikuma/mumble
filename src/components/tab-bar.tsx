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
    <div className="bg-background flex h-[46px] shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-3">
      <div className="flex items-center gap-3">
        <Logo size={28} className="ml-1" />
        <div className="border-border flex gap-0.5 rounded-[9px] border bg-[hsl(40_8%_90%)] p-[2px] dark:bg-[hsl(240_5%_16%)]">
          <SegTab active={view === "history"} onClick={() => onChange("history")}>
            History
            <span className="bg-muted text-muted-foreground rounded-[5px] px-[5px] py-[1px] text-[11px] font-medium tabular-nums">
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
          aria-pressed={view === "settings"}
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-card text-muted-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.14),0_0_0_0.5px_hsl(0_0%_0%/0.05)] transition-colors hover:text-foreground",
            view === "settings" && "text-foreground",
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
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-[7px] px-3 py-1 text-[13px] font-medium transition-colors",
        active
          ? "bg-card text-foreground font-semibold shadow-[0_1px_2px_hsl(0_0%_0%/0.14),0_0_0_0.5px_hsl(0_0%_0%/0.05)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
