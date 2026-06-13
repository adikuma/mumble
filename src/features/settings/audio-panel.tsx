import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTauri, listInputDevices, type DeviceInfo } from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { SettingSection } from "@/components/kit/layout";
import { SettingControl, SettingRow } from "@/features/settings/setting-row";
import { useUpdateSettings } from "@/features/settings/use-update-settings";

export function AudioPanel() {
  const settings = useMumbleStore((s) => s.settings);
  const update = useUpdateSettings();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
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
    </SettingSection>
  );
}
