import { useEffect } from "react";
import {
  getSettings,
  isTauri,
  listHistory,
  onDownloadProgress,
  onError,
  onReady,
  onSettingsChanged,
  onStateChanged,
  onTranscribed,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";

/**
 * Subscribes the Zustand store to backend events and loads initial state.
 * Mount once, at the top of the main window.
 */
export function useBackendBridge() {
  const setAppState = useMumbleStore((s) => s.setAppState);
  const setModelReady = useMumbleStore((s) => s.setModelReady);
  const setError = useMumbleStore((s) => s.setError);
  const setSettings = useMumbleStore((s) => s.setSettings);
  const setTranscripts = useMumbleStore((s) => s.setTranscripts);
  const addTranscript = useMumbleStore((s) => s.addTranscript);
  const setDownload = useMumbleStore((s) => s.setDownload);
  const setHistoryLoading = useMumbleStore((s) => s.setHistoryLoading);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    (async () => {
      try {
        const [settings] = await Promise.all([getSettings()]);
        if (!cancelled) setSettings(settings);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      }

      try {
        setHistoryLoading(true);
        const list = await listHistory();
        if (!cancelled) setTranscripts(list);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }

      const u1 = await onStateChanged((e) => setAppState(e.state));
      const u2 = await onTranscribed((e) => addTranscript(e.transcript));
      const u3 = await onError((e) => setError(e.message));
      const u4 = await onReady((e) => {
        setModelReady(e.ready);
        setDownload(null);
      });
      const u5 = await onDownloadProgress((e) => {
        setDownload(
          e.done
            ? null
            : {
                filename: e.filename,
                downloaded: e.downloaded,
                total: e.total,
              },
        );
      });
      const u6 = await onSettingsChanged((patch) => {
        useMumbleStore.setState((s) =>
          s.settings ? { settings: { ...s.settings, ...patch } } : {},
        );
      });
      unlisteners.push(u1, u2, u3, u4, u5, u6);
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [
    addTranscript,
    setAppState,
    setDownload,
    setError,
    setHistoryLoading,
    setModelReady,
    setSettings,
    setTranscripts,
  ]);
}
