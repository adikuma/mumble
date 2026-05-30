import type { ComponentType } from "react";
import { Home, BarChart3, BookText, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import type { Page } from "@/components/shell/routes";
import { cn } from "@/lib/utils";

export type { Page };

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

const NAV: { id: Page; label: string; Icon: IconType }[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "insights", label: "Insights", Icon: BarChart3 },
  { id: "dictionary", label: "Dictionary", Icon: BookText },
];

interface SidebarProps {
  page: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  bottomBar: boolean;
}

export function Sidebar({
  page,
  onNavigate,
  collapsed,
  bottomBar,
}: SidebarProps) {
  if (bottomBar) {
    return (
      <nav className="bg-sidebar border-border flex shrink-0 items-center justify-around border-t px-2 py-1.5">
        {NAV.map(({ id, label, Icon }) => (
          <NavButton
            key={id}
            active={page === id}
            onClick={() => onNavigate(id)}
            collapsed
            Icon={Icon}
            label={label}
          />
        ))}
        <NavButton
          active={page === "settings"}
          onClick={() => onNavigate("settings")}
          collapsed
          Icon={Settings}
          label="Settings"
        />
      </nav>
    );
  }

  return (
    <aside
      className={cn(
        "bg-sidebar relative flex shrink-0 flex-col py-3 pr-2 pl-3 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-[228px]",
      )}
    >
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Logo size={28} />
        {!collapsed ? (
          <span className="text-lg font-semibold">Mumble</span>
        ) : null}
      </div>
      <nav className="mt-4 flex flex-col gap-1">
        {NAV.map(({ id, label, Icon }) => (
          <NavButton
            key={id}
            active={page === id}
            onClick={() => onNavigate(id)}
            collapsed={collapsed}
            Icon={Icon}
            label={label}
          />
        ))}
      </nav>
      <div className="flex-1" />
      <NavButton
        active={page === "settings"}
        onClick={() => onNavigate("settings")}
        collapsed={collapsed}
        Icon={Settings}
        label="Settings"
      />
    </aside>
  );
}

function NavButton({
  active,
  onClick,
  collapsed,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  Icon: IconType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center",
        active
          ? "bg-background text-foreground dark:bg-sidebar-accent font-semibold"
          : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-accent",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </button>
  );
}
