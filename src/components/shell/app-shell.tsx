import { useState, type ReactNode } from "react";
import { Sidebar, type Page } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Panel } from "@/components/shell/panel";
import { useWindowWidth } from "@/lib/use-window-width";
import { cn } from "@/lib/utils";

interface AppShellProps {
  page: Page;
  onNavigate: (p: Page) => void;
  onOpenSettings: () => void;
  children: ReactNode;
}

export function AppShell({
  page,
  onNavigate,
  onOpenSettings,
  children,
}: AppShellProps) {
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const width = useWindowWidth();
  const collapsed = manualCollapsed || width < 760;
  const bottomBar = width < 520;

  return (
    <div
      className={cn(
        "bg-background text-foreground flex h-screen w-screen overflow-hidden",
        bottomBar && "flex-col-reverse",
      )}
    >
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
        collapsed={collapsed}
        bottomBar={bottomBar}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleSidebar={() => setManualCollapsed((c) => !c)} />
        <Panel>{children}</Panel>
      </div>
    </div>
  );
}
