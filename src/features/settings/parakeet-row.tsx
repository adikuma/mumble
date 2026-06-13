import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  downloadParakeetModel,
  isTauri,
  modelStatus,
  onDownloadProgress,
  onReady,
  type DownloadProgress,
  type ModelStatus,
} from "@/lib/tauri";
import { SettingRow } from "@/features/settings/setting-row";

// the required speech to text model. unlike the cleanup model it has no toggle
// and no delete: the app cannot transcribe without it. the only action is a
// redownload if the files go missing or get corrupted.
export function ParakeetRow() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    modelStatus().then(setStatus).catch(() => setStatus(null));

    let cancelled = false;
    const unsubs: Array<() => void> = [];
    // if cleanup ran before a listen promise resolved, drop it immediately.
    const guard = (fn: () => void) => {
      if (cancelled) fn();
      else unsubs.push(fn);
    };
    onDownloadProgress((p) => {
      if (p.done) {
        setProgress(null);
        modelStatus().then(setStatus).catch(() => {});
      } else {
        setProgress(p);
      }
    }).then(guard);
    onReady(() => {
      modelStatus().then(setStatus).catch(() => {});
    }).then(guard);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  async function onDownload() {
    setDownloading(true);
    try {
      await downloadParakeetModel();
      setStatus(await modelStatus());
      toast.success("Parakeet model ready");
    } catch (e) {
      toast.error(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  const present = status?.present ?? false;

  function renderControl() {
    if (progress) {
      const pct =
        progress.total > 0 ? (progress.downloaded / progress.total) * 100 : 0;
      return (
        <span className="text-muted-foreground text-xs tabular-nums">
          Downloading… {Math.round(pct)}%
        </span>
      );
    }
    if (present) {
      return (
        <>
          <Badge variant="success">Loaded</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={onDownload}
          >
            {downloading ? "Downloading…" : "Redownload"}
          </Button>
        </>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={onDownload}
      >
        {downloading ? "Downloading…" : "Download"}
      </Button>
    );
  }

  return (
    <SettingRow
      title="Parakeet TDT v3"
      desc="Speech to text. Runs locally on your machine. Nothing is sent to the cloud."
    >
      {renderControl()}
    </SettingRow>
  );
}
