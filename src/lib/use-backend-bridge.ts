import { useEffect } from "react";
import { toast } from "sonner";
import {
  getSettings,
  isTauri,
  listHistory,
  modelStatus,
  onDownloadProgress,
  onError,
  onReady,
  onSettingsChanged,
  onToast,
  onTranscribed,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";

/**
 * subscribes the zustand store to backend events and loads initial state.
 * mount once, at the top of the main window.
 */
export function useBackendBridge() {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    (async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) useMumbleStore.setState({ settings });
      } catch (err) {
        console.error("getSettings failed", err);
      }

      try {
        const list = await listHistory();
        if (!cancelled) useMumbleStore.setState({ transcripts: list });
      } catch (err) {
        console.error("listHistory failed", err);
      }

      try {
        // seed model readiness so home can show a download banner on a clean
        // machine instead of a dictate hint that does nothing yet.
        const status = await modelStatus();
        if (!cancelled) useMumbleStore.getState().setModelReady(status.present);
      } catch (err) {
        console.error("modelStatus failed", err);
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

      guard(
        await onTranscribed((e) => {
          useMumbleStore.getState().addTranscript(e.transcript);
        }),
      );
      guard(
        await onSettingsChanged((patch) => {
          const current = useMumbleStore.getState().settings;
          if (current) {
            useMumbleStore.setState({ settings: { ...current, ...patch } });
            return;
          }
          // settings have not loaded yet. fetch the full payload so the patch
          // is not dropped on the floor.
          getSettings()
            .then((next) => {
              if (cancelled) return;
              useMumbleStore.setState({ settings: { ...next, ...patch } });
            })
            .catch((err) => {
              console.error("getSettings refetch failed", err);
            });
        }),
      );
      // surface backend pipeline errors and the focus-changed clipboard
      // fallback so a failed dictation is never silent.
      guard(
        await onError((e) => {
          toast.error(e.message || "Mumble hit an error");
        }),
      );
      guard(
        await onToast((e) => {
          toast.info(e.text);
        }),
      );
      // track the required speech model download so the home view can surface
      // progress instead of staying silent during the first run.
      guard(
        await onDownloadProgress((p) => {
          const store = useMumbleStore.getState();
          if (p.done) {
            store.setDownloadProgress(null);
            store.setModelReady(true);
          } else {
            store.setDownloadProgress(p);
          }
        }),
      );
      guard(
        await onReady((payload) => {
          const store = useMumbleStore.getState();
          store.setModelReady(payload.ready);
          if (payload.ready) store.setDownloadProgress(null);
        }),
      );
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);
}
