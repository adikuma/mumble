import { useState, type ReactNode } from "react";
import { Sidebar, type Page } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Panel } from "@/components/shell/panel";
import { useWindowWidth } from "@/lib/use-window-width";
import { cn } from "@/lib/utils";

interface AppShellProps {
  page: Page;
  onNavigate: (p: Page) => void;
  children: ReactNode;
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const width = useWindowWidth();
  const collapsed = manualCollapsed || width < 760;
  const bottomBar = width < 520;
  // below 760 the sidebar is force collapsed (or a bottom bar), so the manual
  // toggle does nothing. tell the topbar so it can render the button disabled.
  const canToggleSidebar = width >= 760;

  return (
    <div
      className={cn(
        "bg-sidebar text-foreground flex h-screen w-screen overflow-hidden",
        bottomBar && "flex-col-reverse",
      )}
    >
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        collapsed={collapsed}
        bottomBar={bottomBar}
      />
      <div className="bg-sidebar flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar />
        <Panel
          canToggle={canToggleSidebar && !bottomBar}
          collapsed={collapsed}
          onToggleCollapsed={() => setManualCollapsed((c) => !c)}
        >
          {children}
        </Panel>
      </div>
    </div>
  );
}
