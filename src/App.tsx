import { lazy, Suspense, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import type { Page } from "@/components/shell/routes";
import { useBackendBridge } from "@/lib/useBackendBridge";

// lazy load each main view so the initial bundle stays lean. the indicator
// route is also split so the indicator webview never pulls the main app
// bundle on startup.
const HomeView = lazy(() =>
  import("@/features/home/HomeView").then((m) => ({ default: m.HomeView })),
);
const InsightsView = lazy(() =>
  import("@/features/insights/InsightsView").then((m) => ({
    default: m.InsightsView,
  })),
);
const DictionaryView = lazy(() =>
  import("@/features/dictionary/DictionaryView").then((m) => ({
    default: m.DictionaryView,
  })),
);
const SettingsView = lazy(() =>
  import("@/features/settings/SettingsView").then((m) => ({
    default: m.SettingsView,
  })),
);
const IndicatorWindow = lazy(() =>
  import("@/features/indicator/IndicatorWindow").then((m) => ({
    default: m.IndicatorWindow,
  })),
);

function ViewFallback() {
  return <div className="h-full w-full" aria-hidden />;
}

function App() {
  const isIndicatorRoute =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/indicator");
  if (isIndicatorRoute) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ViewFallback />}>
          <IndicatorWindow />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <MainWindow />
    </ErrorBoundary>
  );
}

function MainWindow() {
  useBackendBridge();
  const [page, setPage] = useState<Page>("home");

  return (
    <AppShell page={page} onNavigate={setPage}>
      <Suspense fallback={<ViewFallback />}>
        {page === "home" ? (
          <HomeView />
        ) : page === "insights" ? (
          <InsightsView />
        ) : page === "dictionary" ? (
          <DictionaryView />
        ) : (
          <SettingsView />
        )}
      </Suspense>
    </AppShell>
  );
}

export default App;
