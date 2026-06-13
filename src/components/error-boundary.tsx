import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * top level boundary so a render-phase crash in one webview does not take down
 * the whole window. wrap each independently mounted root (main window,
 * indicator) so failures stay isolated and the surviving root can still
 * recover when the user reloads.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // surface the component stack so the user can paste it into a bug report.
    console.error("ErrorBoundary caught", error, info.componentStack);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="bg-background text-foreground flex h-screen w-screen items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            {error.message || "Unexpected error"}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
