import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import type { Page } from "@/components/shell/sidebar";
import { HomeView } from "@/features/home/HomeView";
import { InsightsView } from "@/features/insights/InsightsView";
import { DictionaryView } from "@/features/dictionary/DictionaryView";
import { SettingsView } from "@/features/settings/SettingsView";
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

  return (
    <AppShell page={page} onNavigate={setPage}>
      {page === "home" ? (
        <HomeView />
      ) : page === "insights" ? (
        <InsightsView />
      ) : page === "dictionary" ? (
        <DictionaryView />
      ) : (
        <SettingsView />
      )}
    </AppShell>
  );
}

export default App;
