import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  captureHotkey,
  getMeter,
  isTauri,
  listInputDevices,
  modelStatus,
  redownloadModel,
  updateSettings,
  type DeviceInfo,
  type ModelStatus,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";

export function SettingsView() {
  const settings = useMumbleStore((s) => s.settings);
  const setSettings = useMumbleStore((s) => s.setSettings);

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [capturingKey, setCapturingKey] = useState(false);
  const [redownloading, setRedownloading] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
    modelStatus()
      .then(setModel)
      .catch(() => setModel(null));
  }, []);

  async function update(patch: Record<string, unknown>) {
    if (!isTauri()) {
      if (settings) {
        setSettings({ ...settings, ...(patch as Partial<typeof settings>) });
      }
      return;
    }
    try {
      const next = await updateSettings(patch);
      setSettings(next);
    } catch (e) {
      toast.error(`Settings update failed: ${(e as Error).message}`);
    }
  }

  async function rebindHotkey() {
    if (!isTauri()) {
      toast.info("Hotkey capture needs the Tauri runtime");
      return;
    }
    setCapturingKey(true);
    try {
      const key = await captureHotkey();
      await update({ hotkey: key });
      toast.success(`Hotkey bound to ${key}`);
    } catch (e) {
      toast.error(`Capture failed: ${(e as Error).message}`);
    } finally {
      setCapturingKey(false);
    }
  }

  async function handleRedownload() {
    setRedownloading(true);
    try {
      await redownloadModel();
      const next = await modelStatus();
      setModel(next);
      toast.success("Model re-downloaded");
    } catch (e) {
      toast.error(`Re-download failed: ${(e as Error).message}`);
    } finally {
      setRedownloading(false);
    }
  }

  const launchAtLogin = settings?.launchAtLogin ?? false;
  const startMinimized = settings?.startMinimized ?? false;
  const hotkey = settings?.hotkey ?? "RightCtrl";
  const inputDevice = settings?.inputDevice ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-6 py-8">
        <h1 className="text-lg font-semibold">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Hotkey</CardTitle>
            <CardDescription>
              Hold anywhere on your system to record, release to transcribe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow
              label="Push-to-talk key"
              control={
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {capturingKey ? "Press any key…" : formatHotkey(hotkey)}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={rebindHotkey}
                    disabled={capturingKey}
                  >
                    {capturingKey ? "Listening…" : "Change"}
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audio</CardTitle>
            <CardDescription>
              Choose which microphone Mumble listens to.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SettingRow
              label="Input device"
              control={
                <DevicePicker
                  value={inputDevice}
                  devices={devices}
                  onChange={(name) => update({ inputDevice: name })}
                />
              }
            />
            <Separator />
            <SettingRow label="Input level" control={<MeterPreview />} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Startup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SettingRow
              label="Launch at login"
              control={
                <Switch
                  checked={launchAtLogin}
                  onCheckedChange={(v) => update({ launchAtLogin: v })}
                />
              }
            />
            <Separator />
            <SettingRow
              label="Start minimized to tray"
              control={
                <Switch
                  checked={startMinimized}
                  onCheckedChange={(v) => update({ startMinimized: v })}
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model</CardTitle>
            <CardDescription>
              Local on-device transcription. Your audio never leaves this
              machine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {model?.name ?? "Parakeet-TDT v3 (English)"}
                </div>
                <div className="text-muted-foreground truncate font-mono text-[11px]">
                  {model?.path ?? "%APPDATA%\\Mumble\\models"} ·{" "}
                  {model?.present ? "installed" : "not downloaded"}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedownload}
                disabled={redownloading}
              >
                {redownloading ? "Downloading…" : "Re-download"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version 0.1.0</span>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() =>
                window.open("https://github.com/adikuma/mumble", "_blank")
              }
            >
              View on GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DevicePicker({
  value,
  devices,
  onChange,
}: {
  value: string | null;
  devices: DeviceInfo[];
  onChange: (name: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.currentTarget.value || null)}
      className="border-input bg-background focus-visible:ring-ring h-8 max-w-[240px] truncate rounded-md border px-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
    >
      <option value="">System Default</option>
      {devices.map((d) => (
        <option key={d.name} value={d.name}>
          {d.name}
          {d.isDefault ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}

function SettingRow({
  label,
  control,
}: {
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {control}
    </div>
  );
}

function MeterPreview() {
  const [rms, setRms] = useState(0);
  useEffect(() => {
    if (!isTauri()) return;
    const id = setInterval(() => {
      getMeter()
        .then(setRms)
        .catch(() => {});
    }, 60);
    return () => clearInterval(id);
  }, []);

  const bars = 8;
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const lit = Math.min(1, rms * 3.5) >= threshold;
        return (
          <div
            key={i}
            className={
              lit
                ? "bg-brand w-[3px] rounded-sm"
                : "bg-muted-foreground/40 w-[3px] rounded-sm"
            }
            style={{ height: `${30 + i * 10}%` }}
          />
        );
      })}
    </div>
  );
}

function formatHotkey(raw: string): string {
  return raw
    .replace(/^Right([A-Z])/, "Right $1")
    .replace(/^Left([A-Z])/, "Left $1");
}
