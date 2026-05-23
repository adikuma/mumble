import { useState } from "react";
import { TabBar, type View } from "@/components/tab-bar";
import { Titlebar } from "@/components/titlebar";
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
  if (isIndicatorRoute) return <IndicatorWindow />;
  return <MainWindow />;
}

function initialView(): View {
  if (typeof window === "undefined") return "history";
  const h = window.location.hash;
  if (h.startsWith("#/insights")) return "insights";
  if (h.startsWith("#/settings")) return "settings";
  return "history";
}

function MainWindow() {
  useBackendBridge();
  const [view, setView] = useState<View>(initialView);
  const transcripts = useMumbleStore((s) => s.transcripts);

  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden">
      <Titlebar />
      <TabBar view={view} onChange={setView} historyCount={transcripts.length} />
      <main className="flex min-h-0 flex-1 flex-col">
        {view === "history" ? (
          <HistoryView />
        ) : view === "insights" ? (
          <InsightsView />
        ) : (
          <SettingsView />
        )}
      </main>
    </div>
  );
}

export default App;
