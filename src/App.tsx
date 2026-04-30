import { useEffect, useState } from "react";
import { Sidebar, type View } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { HistoryView } from "@/features/history/HistoryView";
import { SettingsView } from "@/features/settings/SettingsView";
import { IndicatorWindow } from "@/features/indicator/IndicatorWindow";
import { useBackendBridge } from "@/lib/useBackendBridge";
import { useMumbleStore } from "@/store";
import { Toaster } from "sonner";

function App() {
  const isIndicatorRoute =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/indicator");

  if (isIndicatorRoute) {
    return <IndicatorWindow />;
  }

  return <MainWindow />;
}

function MainWindow() {
  useBackendBridge();

  const [view, setView] = useState<View>("history");
  const [collapsed, setCollapsed] = useState(false);

  const appState = useMumbleStore((s) => s.appState);
  const settings = useMumbleStore((s) => s.settings);
  const download = useMumbleStore((s) => s.download);
  const error = useMumbleStore((s) => s.error);
  const setError = useMumbleStore((s) => s.setError);

  useEffect(() => {
    const check = () => setCollapsed(window.innerWidth < 800);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error, setError]);

  const hotkey = settings?.hotkey ?? "Right Ctrl";

  return (
    <div className="bg-background text-foreground flex h-screen w-screen overflow-hidden">
      <Sidebar
        view={view}
        onChange={setView}
        hotkey={formatHotkey(hotkey)}
        collapsed={collapsed}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-12 items-center justify-between gap-3 border-b px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold capitalize">{view}</span>
            {appState !== "idle" && appState !== "paused" && (
              <span className="text-muted-foreground text-xs">
                · {appState}
              </span>
            )}
            {download && (
              <span className="text-muted-foreground text-xs">
                · downloading {download.filename} (
                {Math.round(
                  (download.downloaded / Math.max(1, download.total)) * 100,
                )}
                %)
              </span>
            )}
          </div>
          <ThemeToggle />
        </header>

        <div className="min-h-0 flex-1">
          {view === "history" ? <HistoryView /> : <SettingsView />}
        </div>
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
}

function formatHotkey(raw: string): string {
  return raw
    .replace(/^Right/, "Right ")
    .replace(/^Left/, "Left ")
    .replace("Ctrl", "Ctrl");
}

export default App;
