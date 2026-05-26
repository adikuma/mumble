import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  isTauri,
  listInputDevices,
  modelStatus,
  type DeviceInfo,
  type ModelStatus,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { SettingSection } from "@/components/kit/layout";
import { SettingControl, SettingRow } from "@/features/settings/setting-row";
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
    <SettingSection title="Audio">
      <SettingRow title="Microphone" desc="Microphone used during recording.">
        <Select
          value={inputDevice || "default"}
          onValueChange={(v) =>
            update({ inputDevice: v === "default" ? null : v })
          }
        >
          <SettingControl width="lg">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
          </SettingControl>
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
        {model?.present ? <Badge variant="success">Loaded</Badge> : null}
      </SettingRow>
    </SettingSection>
  );
}
