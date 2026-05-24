import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
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
  const preRoll = String(settings?.preRollMs ?? 450);

  return (
    <>
      <h2 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.07em] uppercase">
        General
      </h2>
      <SettingRow
        title="Push-to-talk hotkey"
        desc="Hold to record, release to transcribe and paste."
      >
        <span className="kbd">{capturing ? "Press any key…" : hotkey}</span>
        <button
          onClick={rebind}
          disabled={capturing}
          className="border-border hover:bg-accent rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {capturing ? "Listening…" : "Change"}
        </button>
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
    </>
  );
}
