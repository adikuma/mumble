import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  cancelCleanupDownload,
  cleanupStatus,
  deleteCleanupModel,
  downloadCleanupModel,
  isTauri,
  onCleanupDownloadProgress,
  type CleanupDownloadProgress,
  type CleanupStatus,
} from "@/lib/tauri";

export type CleanupPhase =
  | "loading"
  | "absent"
  | "downloading"
  | "present"
  | "error";

export interface CleanupDownloadState {
  status: CleanupStatus | null;
  progress: CleanupDownloadProgress | null;
  phase: CleanupPhase;
  hasEnoughDisk: boolean;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  remove: () => Promise<void>;
}

// owns the cleanup model lifecycle for the settings row: status, live download
// progress, and the start / cancel / delete actions. kept out of the global
// store because only the cleanup row needs it. failures toast directly from
// the action that hit them instead of round tripping through state.
export function useCleanupDownload(): CleanupDownloadState {
  const [status, setStatus] = useState<CleanupStatus | null>(null);
  const [progress, setProgress] = useState<CleanupDownloadProgress | null>(null);
  // outside the tauri runtime (browser dev) there is no model, so start in the
  // absent phase. this also keeps refresh free of any synchronous setState so
  // it is safe to fire from an effect.
  const [phase, setPhase] = useState<CleanupPhase>(() =>
    isTauri() ? "loading" : "absent",
  );

  // apply a fresh status snapshot. used by both the initial fetch and the
  // post action refreshes. setState only ever runs from a promise callback or
  // an event handler, never synchronously inside an effect.
  const applyStatus = useCallback((s: CleanupStatus) => {
    setStatus(s);
    // never clobber an in flight download with a status poll.
    setPhase((prev) =>
      prev === "downloading" ? prev : s.present ? "present" : "absent",
    );
  }, []);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      applyStatus(await cleanupStatus());
    } catch (e) {
      toast.error(`Cleanup status failed: ${(e as Error).message}`);
      setPhase("error");
    }
  }, [applyStatus]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    cleanupStatus()
      .then(applyStatus)
      .catch((e) => {
        toast.error(
          `Cleanup status failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        setPhase("error");
      });
    let unlisten: (() => void) | undefined;
    // if cleanup ran before the listen promise resolved, drop it immediately.
    onCleanupDownloadProgress((p) => setProgress(p)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyStatus]);

  const start = useCallback(async () => {
    setProgress(null);
    setPhase("downloading");
    try {
      await downloadCleanupModel();
      setProgress(null);
      await refresh();
      setPhase("present");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setProgress(null);
      // a cancel rejects the same promise; treat it as a clean return to
      // absent rather than an error state.
      if (msg.toLowerCase().includes("cancel")) {
        await refresh();
        setPhase("absent");
      } else {
        toast.error(`Cleanup download failed: ${msg}`);
        setPhase("error");
      }
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    try {
      await cancelCleanupDownload();
    } catch {
      // the download promise rejection drives the state; ignore here.
    }
  }, []);

  const remove = useCallback(async () => {
    try {
      await deleteCleanupModel();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
    await refresh();
  }, [refresh]);

  const hasEnoughDisk =
    status === null || status.availableDiskBytes >= status.requiredDiskBytes;

  return {
    status,
    progress,
    phase,
    hasEnoughDisk,
    start,
    cancel,
    remove,
  };
}
