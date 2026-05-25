import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { captureHotkey, isTauri } from "@/lib/tauri";
import { formatHotkey } from "@/lib/utils";
import { useMumbleStore } from "@/store";
import { SettingSection } from "@/components/kit/layout";
import { SettingRow } from "@/features/settings/setting-row";
import { useUpdateSettings } from "@/features/settings/use-update-settings";

export function GeneralPanel() {
  const settings = useMumbleStore((s) => s.settings);
  const update = useUpdateSettings();
  const [capturing, setCapturing] = useState(false);

  async function rebind() {
    if (!isTauri()) {
      toast.info("Hotkey capture needs the Tauri runtime");
      return;
    }
    setCapturing(true);
    try {
      const key = await captureHotkey();
      await update({ hotkey: key });
      toast.success(`Hotkey bound to ${formatHotkey(key)}`);
    } catch (e) {
      toast.error(`Capture failed: ${(e as Error).message}`);
    } finally {
      setCapturing(false);
    }
  }

  const hotkey = formatHotkey(settings?.hotkey ?? "Right Alt");
  const autoPaste = settings?.autoPaste ?? true;
  const launchAtLogin = settings?.launchAtLogin ?? false;
  const preRoll = String(settings?.preRollMs ?? 0);

  return (
    <SettingSection title="General">
      <SettingRow
        title="Push-to-talk hotkey"
        desc="Hold to record, release to transcribe and paste."
      >
        <span className="kbd">{capturing ? "Press any key…" : hotkey}</span>
        <Button
          onClick={rebind}
          disabled={capturing}
          variant="outline"
          size="sm"
        >
          {capturing ? "Listening…" : "Change"}
        </Button>
      </SettingRow>
      <SettingRow
        title="Auto-paste at cursor"
        desc="Drop the transcript wherever your caret is."
      >
        <Switch
          checked={autoPaste}
          onCheckedChange={(v) => update({ autoPaste: v })}
        />
      </SettingRow>
      <SettingRow
        title="Launch at login"
        desc="Start Mumble when Windows starts."
      >
        <Switch
          checked={launchAtLogin}
          onCheckedChange={(v) => update({ launchAtLogin: v })}
        />
      </SettingRow>
      <SettingRow
        title="Pre-roll buffer"
        desc="Capture audio just before the key so it never clips you."
      >
        <Select
          value={preRoll}
          onValueChange={(v) => update({ preRollMs: Number(v) })}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Off</SelectItem>
            <SelectItem value="250">250 ms</SelectItem>
            <SelectItem value="450">450 ms</SelectItem>
            <SelectItem value="800">800 ms</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingSection>
  );
}
