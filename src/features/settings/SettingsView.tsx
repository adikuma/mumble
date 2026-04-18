import { useState } from "react";
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

export function SettingsView() {
  const [launchAtLogin, setLaunchAtLogin] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);

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
                    Right Ctrl
                  </Badge>
                  <Button variant="outline" size="sm">
                    Change
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
                <Badge variant="outline" className="font-mono">
                  System Default
                </Badge>
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
                  onCheckedChange={setLaunchAtLogin}
                />
              }
            />
            <Separator />
            <SettingRow
              label="Start minimized to tray"
              control={
                <Switch
                  checked={startMinimized}
                  onCheckedChange={setStartMinimized}
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
                  Parakeet-TDT v3 (English)
                </div>
                <div className="text-muted-foreground truncate font-mono text-[11px]">
                  %APPDATA%\Mumble\models\parakeet-tdt-v3.onnx · 615 MB
                </div>
              </div>
              <Button variant="outline" size="sm">
                Re-download
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
            <Button variant="link" className="h-auto p-0">
              View on GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
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
  const heights = [30, 55, 80, 95, 60, 40, 20, 10];
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {heights.map((h, i) => (
        <div
          key={i}
          className={
            i < 4
              ? "bg-brand w-[3px] rounded-sm"
              : "bg-muted-foreground/40 w-[3px] rounded-sm"
          }
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
