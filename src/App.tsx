import { useEffect, useState } from "react";
import { Sidebar, type View } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { HistoryView } from "@/features/history/HistoryView";
import { SettingsView } from "@/features/settings/SettingsView";
import { MicIndicator } from "@/features/indicator/MicIndicator";

function App() {
  const [view, setView] = useState<View>("history");
  const [collapsed, setCollapsed] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const check = () => setCollapsed(window.innerWidth < 800);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="bg-background text-foreground flex h-screen w-screen overflow-hidden">
      <Sidebar
        view={view}
        onChange={setView}
        hotkey="Right Ctrl"
        collapsed={collapsed}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-12 items-center justify-between gap-3 border-b px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold capitalize">{view}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowIndicator((v) => !v)}
              className="text-muted-foreground hover:bg-muted rounded-md px-2 py-1 font-mono text-[11px]"
              aria-label="Toggle mic preview"
            >
              {showIndicator ? "Hide preview" : "Preview mic"}
            </button>
            <ThemeToggle />
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {view === "history" ? <HistoryView /> : <SettingsView />}
        </div>
      </main>

      {showIndicator && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 flex justify-center">
          <MicIndicator state="listening" seconds={3} />
        </div>
      )}
    </div>
  );
}

export default App;
