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
 * subscribes the zustand store to backend events and loads initial state.
 * mount once, at the top of the main window.
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
        const settings = await getSettings();
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

      // listeners register after awaits. if the effect was cleaned up during
      // those awaits (react strict mode mounts, unmounts, then remounts in
      // dev), the cleanup already ran against an empty list, so register only
      // when still live and otherwise unlisten immediately. without this the
      // first listener set leaks and every event is handled twice.
      const guard = (u: () => void) => {
        if (cancelled) u();
        else unlisteners.push(u);
      };

      guard(await onStateChanged((e) => setAppState(e.state)));
      guard(await onTranscribed((e) => addTranscript(e.transcript)));
      guard(await onError((e) => setError(e.message)));
      guard(
        await onReady((e) => {
          setModelReady(e.ready);
          setDownload(null);
        }),
      );
      guard(
        await onDownloadProgress((e) => {
          setDownload(
            e.done
              ? null
              : {
                  filename: e.filename,
                  downloaded: e.downloaded,
                  total: e.total,
                },
          );
        }),
      );
      guard(
        await onSettingsChanged((patch) => {
          useMumbleStore.setState((s) =>
            s.settings ? { settings: { ...s.settings, ...patch } } : {},
          );
        }),
      );
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
