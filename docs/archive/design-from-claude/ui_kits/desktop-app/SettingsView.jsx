/* global React, MumblePrimitives */
const {
  Icon, Button, Badge, Switch, Separator,
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} = window.MumblePrimitives;

function SettingsView({ settings, onChange, onCaptureHotkey, capturing, toast }) {
  const [downloading, setDownloading] = React.useState(false);
  const [downloadPct, setDownloadPct] = React.useState(0);

  function startRedownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadPct(0);
    const interval = setInterval(() => {
      setDownloadPct((p) => {
        const next = Math.min(100, p + 100 / 30); // ~3s
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setDownloading(false);
            toast?.("Model re-downloaded");
          }, 200);
        }
        return next;
      });
    }, 100);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          Settings
        </h1>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="keyboard" size={16} style={{ color: "var(--muted-foreground)" }} />
              <CardTitle>Hotkey</CardTitle>
            </div>
            <CardDescription>
              Hold anywhere on your system to record, release to transcribe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow
              label="Push-to-talk key"
              control={
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: capturing ? "var(--muted-foreground)" : "var(--foreground)",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {capturing ? "Press any key…" : settings.hotkey}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCaptureHotkey}
                    disabled={capturing}
                  >
                    {capturing ? "Listening…" : "Change"}
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="mic" size={16} style={{ color: "var(--muted-foreground)" }} />
              <CardTitle>Audio</CardTitle>
            </div>
            <CardDescription>Choose which microphone Mumble listens to.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SettingRow
              label="Input device"
              control={
                <select
                  value={settings.inputDevice ?? ""}
                  onChange={(e) => onChange({ inputDevice: e.target.value || null })}
                  style={{
                    height: 36,
                    minWidth: 220,
                    maxWidth: 240,
                    padding: "0 12px",
                    border: "1px solid var(--input)",
                    borderRadius: 6,
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">System Default</option>
                  <option value="Yeti X">Yeti X (default)</option>
                  <option value="MacBook Pro Mic">MacBook Pro Mic</option>
                  <option value="AirPods Pro">AirPods Pro</option>
                </select>
              }
            />
            <Separator />
            <SettingRow label="Input level" control={<MeterPreview />} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="power" size={16} style={{ color: "var(--muted-foreground)" }} />
              <CardTitle>Startup</CardTitle>
            </div>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SettingRow
              label="Launch at login"
              control={
                <Switch
                  checked={settings.launchAtLogin}
                  onCheckedChange={(v) => onChange({ launchAtLogin: v })}
                />
              }
            />
            <Separator />
            <SettingRow
              label="Start minimized to tray"
              control={
                <Switch
                  checked={settings.startMinimized}
                  onCheckedChange={(v) => onChange({ startMinimized: v })}
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="cpu" size={16} style={{ color: "var(--muted-foreground)" }} />
              <CardTitle>Model</CardTitle>
            </div>
            <CardDescription>
              Local on-device transcription. Your audio never leaves this machine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Parakeet-TDT v3 (English)</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  %APPDATA%\Mumble\models · 612 MB · installed
                </div>
              </div>
              {downloading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 120,
                      height: 6,
                      background: "var(--muted)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${downloadPct}%`,
                        height: "100%",
                        background: "var(--foreground)",
                        transition: "width 200ms",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round((downloadPct / 100) * 612)} MB / 612 MB
                  </span>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={startRedownload}>
                  <Icon name="download" size={14} />
                  <span>Re-download</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="info" size={16} style={{ color: "var(--muted-foreground)" }} />
              <CardTitle>About</CardTitle>
            </div>
          </CardHeader>
          <CardContent
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--muted-foreground)" }}>Version 0.1.0 · Tauri 2 · Rust 1.84</span>
            <button
              onClick={() => toast?.("Would open GitHub")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                color: "var(--foreground)",
                fontSize: 13,
                fontFamily: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              <span>View on GitHub</span>
              <Icon name="github" size={14} />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingRow({ label, control }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {control}
    </div>
  );
}

function MeterPreview() {
  const [rms, setRms] = React.useState(0.2);
  React.useEffect(() => {
    const id = setInterval(() => {
      setRms(0.15 + Math.random() * 0.45);
    }, 80);
    return () => clearInterval(id);
  }, []);
  const bars = 8;
  return (
    <div style={{ display: "flex", height: 20, alignItems: "flex-end", gap: 2 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const lit = Math.min(1, rms * 3.5) >= threshold;
        return (
          <div
            key={i}
            style={{
              width: 3,
              borderRadius: 2,
              background: lit ? "var(--foreground)" : "rgba(113,113,122,0.4)",
              height: `${30 + i * 10}%`,
              transition: "background-color 75ms",
            }}
          />
        );
      })}
    </div>
  );
}

window.MumbleSettingsView = SettingsView;
