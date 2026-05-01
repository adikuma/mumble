import { useState } from "react";
import { Sidebar, type View } from "@/components/sidebar";
import { Titlebar } from "@/components/titlebar";
import { AppHeader } from "@/components/app-header";
import { HistoryView } from "@/features/history/HistoryView";
import { InsightsView } from "@/features/insights/InsightsView";
import { SettingsView } from "@/features/settings/SettingsView";
import { IndicatorWindow } from "@/features/indicator/IndicatorWindow";
import { useBackendBridge } from "@/lib/useBackendBridge";
import { useMumbleStore } from "@/store";

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
  const transcripts = useMumbleStore((s) => s.transcripts);

  const headerTitle =
    view === "history"
      ? "History"
      : view === "insights"
        ? "Insights"
        : "Settings";
  const headerMeta =
    view === "history"
      ? `${transcripts.length} ${transcripts.length === 1 ? "transcript" : "transcripts"}`
      : view === "insights"
        ? "last 7 days"
        : undefined;

  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onChange={setView} />
        <main className="flex min-w-0 flex-1 flex-col">
          <AppHeader title={headerTitle} meta={headerMeta} />
          {view === "history" ? (
            <HistoryView />
          ) : view === "insights" ? (
            <InsightsView />
          ) : (
            <SettingsView />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
