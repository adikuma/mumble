import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMumbleStore } from "@/store";
import { SettingRow } from "@/features/settings/setting-row";
import { useUpdateSettings } from "@/features/settings/use-update-settings";
import { useCleanupDownload } from "@/features/settings/use-cleanup-download";

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

// thin determinate progress bar. no shared Progress primitive exists yet and
// this is the only caller, so it lives inline.
function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function CleanupRow() {
  const settings = useMumbleStore((s) => s.settings);
  const update = useUpdateSettings();
  const { status, progress, phase, hasEnoughDisk, start, cancel, remove } =
    useCleanupDownload();

  const enabled = settings?.cleanupEnabled ?? false;
  const sizeLabel = status ? gb(status.sizeBytes) : "1.98 GB";

  const desc =
    "Polishes raw dictation: removes fillers, fixes punctuation and casing. Optional, runs locally.";

  async function onDelete() {
    await remove();
    // you cannot have cleanup enabled with no model on disk, so clear the
    // preference when the bytes go away.
    if (enabled) await update({ cleanupEnabled: false });
    toast.success("Cleanup model deleted");
  }

  function renderControl() {
    if (phase === "loading") {
      return <span className="text-muted-foreground text-sm">Checking…</span>;
    }

    if (phase === "downloading") {
      const pct =
        progress && progress.aggregateTotal > 0
          ? (progress.aggregateDownloaded / progress.aggregateTotal) * 100
          : 0;
      const got = progress ? gb(progress.aggregateDownloaded) : "0.00 GB";
      const total = progress ? gb(progress.aggregateTotal) : sizeLabel;
      return (
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-56">
          <ProgressBar value={pct} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">
              {got} / {total}
            </span>
            <Button variant="ghost" size="xs" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    if (phase === "present") {
      return (
        <>
          <Badge variant="success">Downloaded</Badge>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => update({ cleanupEnabled: v })}
          />
          <Button variant="destructive-outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </>
      );
    }

    // absent or error: offer the download, gated on free disk.
    const blocked = !hasEnoughDisk;
    const haveGb = status ? gb(status.availableDiskBytes) : "?";
    const needGb = status ? gb(status.requiredDiskBytes) : "2.50 GB";
    return (
      <>
        <Badge variant="outline">{sizeLabel}</Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={blocked}
          title={
            blocked ? `Need ${needGb} free, you have ${haveGb}` : undefined
          }
          onClick={start}
        >
          Download
        </Button>
      </>
    );
  }

  return (
    <SettingRow title="Cleanup model" desc={desc}>
      {renderControl()}
    </SettingRow>
  );
}
