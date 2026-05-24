import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import type { Page } from "@/components/shell/sidebar";
import { HomeView } from "@/features/home/HomeView";
import { InsightsView } from "@/features/insights/InsightsView";
import { DictionaryView } from "@/features/dictionary/DictionaryView";
import { ScratchpadView } from "@/features/scratchpad/ScratchpadView";
import { SettingsModal } from "@/features/settings/SettingsModal";
import { IndicatorWindow } from "@/features/indicator/IndicatorWindow";
import { useBackendBridge } from "@/lib/useBackendBridge";

function App() {
  const isIndicatorRoute =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/indicator");
  if (isIndicatorRoute) return <IndicatorWindow />;
  return <MainWindow />;
}

function MainWindow() {
  useBackendBridge();
  const [page, setPage] = useState<Page>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <AppShell
        page={page}
        onNavigate={setPage}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {page === "home" ? (
          <HomeView />
        ) : page === "insights" ? (
          <InsightsView />
        ) : page === "dictionary" ? (
          <DictionaryView />
        ) : (
          <ScratchpadView />
        )}
      </AppShell>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

export default App;
