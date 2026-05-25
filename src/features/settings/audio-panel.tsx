import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isTauri,
  listInputDevices,
  modelStatus,
  type DeviceInfo,
  type ModelStatus,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { SettingRow } from "@/features/settings/setting-row";
import { useUpdateSettings } from "@/features/settings/use-update-settings";

export function AudioPanel() {
  const settings = useMumbleStore((s) => s.settings);
  const update = useUpdateSettings();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [model, setModel] = useState<ModelStatus | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
    modelStatus()
      .then(setModel)
      .catch(() => setModel(null));
  }, []);

  const inputDevice = settings?.inputDevice ?? "";

  return (
    <>
      <h2 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.07em] uppercase">
        Audio
      </h2>
      <div className="bg-card/68 border-border surface-3d shadow-lift overflow-hidden rounded-[13px] border backdrop-blur-md">
        <SettingRow title="Microphone" desc="Microphone used during recording.">
          <Select
            value={inputDevice || "default"}
            onValueChange={(v) =>
              update({ inputDevice: v === "default" ? null : v })
            }
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">System Default</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name}
                  {d.isDefault ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Model"
          desc="Runs locally on your machine. Nothing is sent to the cloud."
        >
          <span className="text-sm font-medium">
            {model?.name ?? "Parakeet-TDT v3"}
          </span>
          {model?.present ? (
            <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400">
              Loaded
            </span>
          ) : null}
        </SettingRow>
      </div>
    </>
  );
}
