import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatHotkey } from "@/lib/utils";
import {
  captureHotkey,
  getMeter,
  isTauri,
  listInputDevices,
  modelStatus,
  updateSettings,
  type DeviceInfo,
  type ModelStatus,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";

/**
 * settings rows that don't have backend support yet. persist to
 * localstorage so toggles survive a reload. they don't currently change
 * pipeline behavior. backend driven rows (hotkey, input device, pre roll,
 * auto paste, launch at login) hit tauri commands.
 */
type LocalSettings = {
  modelId: "parakeet" | "whisper-base" | "whisper-small";
  language: "en";
  autoPunctuation: boolean;
  removeFillers: boolean;
  analytics: boolean;
};

const LOCAL_DEFAULTS: LocalSettings = {
  modelId: "parakeet",
  language: "en",
  autoPunctuation: true,
  removeFillers: false,
  analytics: false,
};

const LOCAL_KEYS: Array<keyof LocalSettings> = [
  "modelId",
  "language",
  "autoPunctuation",
  "removeFillers",
  "analytics",
];

function readLocal<K extends keyof LocalSettings>(key: K): LocalSettings[K] {
  const raw = localStorage.getItem(`mumble:setting:${key}`);
  if (raw === null) return LOCAL_DEFAULTS[key];
  try {
    return JSON.parse(raw) as LocalSettings[K];
  } catch {
    return LOCAL_DEFAULTS[key];
  }
}

function writeLocal<K extends keyof LocalSettings>(
  key: K,
  value: LocalSettings[K],
): void {
  localStorage.setItem(`mumble:setting:${key}`, JSON.stringify(value));
}

function useLocal<K extends keyof LocalSettings>(
  key: K,
): [LocalSettings[K], (next: LocalSettings[K]) => void] {
  const [value, setValue] = useState<LocalSettings[K]>(() => readLocal(key));
  return [
    value,
    (next) => {
      writeLocal(key, next);
      setValue(next);
    },
  ];
}

export function SettingsView() {
  const settings = useMumbleStore((s) => s.settings);
  const setSettings = useMumbleStore((s) => s.setSettings);

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [editDictionary, setEditDictionary] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);

  const [modelId, setModelId] = useLocal("modelId");
  const [language, setLanguage] = useLocal("language");
  const [autoPunctuation, setAutoPunctuation] = useLocal("autoPunctuation");
  const [removeFillers, setRemoveFillers] = useLocal("removeFillers");
  const [analytics, setAnalytics] = useLocal("analytics");

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

  function resetDefaults() {
    LOCAL_KEYS.forEach((k) => {
      localStorage.removeItem(`mumble:setting:${k}`);
    });
    setResetCounter((n) => n + 1);
    void update({
      preRollMs: 450,
      autoPaste: true,
    });
    toast.success("Settings reset");
  }

  useEffect(() => {
    if (resetCounter === 0) return;
    setModelId(LOCAL_DEFAULTS.modelId);
    setLanguage(LOCAL_DEFAULTS.language);
    setAutoPunctuation(LOCAL_DEFAULTS.autoPunctuation);
    setRemoveFillers(LOCAL_DEFAULTS.removeFillers);
    setAnalytics(LOCAL_DEFAULTS.analytics);
  }, [
    resetCounter,
    setModelId,
    setLanguage,
    setAutoPunctuation,
    setRemoveFillers,
    setAnalytics,
  ]);

  const launchAtLogin = settings?.launchAtLogin ?? false;
  const autoPaste = settings?.autoPaste ?? true;
  const preRollMs = String(settings?.preRollMs ?? 450) as
    | "0"
    | "250"
    | "450"
    | "800";
  const hotkey = formatHotkey(settings?.hotkey ?? "Right Alt");
  const inputDevice = settings?.inputDevice ?? "";

  return (
    <div className="flex flex-1 justify-center overflow-y-auto">
      <div className="w-full max-w-[640px] px-9 pt-7 pb-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">
            Settings
          </h1>
        </header>

        <Section title="Hotkey">
          <Row
            label="Push-to-talk key"
            description="Hold to record. Release to transcribe and paste."
          >
            <span className="kbd">{capturing ? "Press any key…" : hotkey}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={rebindHotkey}
              disabled={capturing}
            >
              {capturing ? "Listening…" : "Change"}
            </Button>
          </Row>
          <Row
            label="Pre-roll buffer"
            description="Captures audio just before you press the key, so it never clips your first syllable."
          >
            <NativeSelect
              value={preRollMs}
              onChange={(v) => update({ preRollMs: Number(v) })}
            >
              <option value="0">Off</option>
              <option value="250">250 ms</option>
              <option value="450">450 ms</option>
              <option value="800">800 ms</option>
            </NativeSelect>
          </Row>
        </Section>

        <Section title="Audio">
          <Row
            label="Input device"
            description="Microphone used during recording."
          >
            <NativeSelect
              value={inputDevice}
              onChange={(v) => update({ inputDevice: v || null })}
              minWidth={220}
            >
              <option value="">System Default</option>
              {devices.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                  {d.isDefault ? " (default)" : ""}
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row
            label="Input level"
            description="Live signal from your selected mic."
          >
            <InputMeter />
          </Row>
        </Section>

        <Section title="Transcription">
          <Row
            label="Model"
            description="Runs locally. Larger = more accurate, more memory."
          >
            <NativeSelect
              value={modelId}
              onChange={(v) => setModelId(v as LocalSettings["modelId"])}
            >
              <option value="parakeet">Parakeet-TDT v3 · 600 MB</option>
              <option value="whisper-base">Whisper Base · 150 MB</option>
              <option value="whisper-small">Whisper Small · 480 MB</option>
            </NativeSelect>
            {model?.present ? <Pill>Loaded</Pill> : null}
          </Row>
          <Row
            label="Language"
            description="Currently English-only. More coming."
          >
            <NativeSelect
              value={language}
              onChange={(v) => setLanguage(v as LocalSettings["language"])}
            >
              <option value="en">English (US)</option>
            </NativeSelect>
          </Row>
          <Row
            label="Auto-punctuation"
            description="Adds commas and periods based on prosody."
          >
            <Switch
              checked={autoPunctuation}
              onCheckedChange={setAutoPunctuation}
            />
          </Row>
          <Row
            label="Remove fillers"
            description="Strips um, uh, like, you know."
          >
            <Switch
              checked={removeFillers}
              onCheckedChange={setRemoveFillers}
            />
          </Row>
          <Row
            label="Custom dictionary"
            description="Proper nouns and replacements."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDictionary(true)}
            >
              Edit…
            </Button>
          </Row>
        </Section>

        <Section title="Behavior">
          <Row
            label="Auto-paste at cursor"
            description="Drops the transcript wherever your caret is. When off, the transcript is left in your clipboard so you can paste it manually."
          >
            <Switch
              checked={autoPaste}
              onCheckedChange={(v) => update({ autoPaste: v })}
            />
          </Row>
          <Row label="Launch at login">
            <Switch
              checked={launchAtLogin}
              onCheckedChange={(v) => update({ launchAtLogin: v })}
            />
          </Row>
          <Row
            label="Send anonymous analytics"
            description="No transcript content ever leaves your machine."
          >
            <Switch checked={analytics} onCheckedChange={setAnalytics} />
          </Row>
        </Section>

        <footer className="border-border text-muted-foreground mt-6 flex items-center justify-between border-t pt-4 text-xs">
          <span>
            Mumble v0.1.0 ·{" "}
            <button className="text-foreground hover:underline">
              Check for updates
            </button>
          </span>
          <button
            onClick={resetDefaults}
            className="text-foreground hover:underline"
          >
            Reset to defaults
          </button>
        </footer>
      </div>

      <Dialog open={editDictionary} onOpenChange={setEditDictionary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom dictionary</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDictionary(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border flex flex-col gap-1 border-t py-[18px] first:border-t-0 first:pt-0">
      <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.08em] uppercase">
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-center justify-between gap-4 py-3 [&+&]:border-t">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-foreground text-sm font-medium">{label}</span>
        {description ? (
          <span
            className="text-muted-foreground text-xs"
            style={{ lineHeight: 1.4 }}
          >
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  minWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cn(
        "border-input bg-background text-foreground h-7 cursor-pointer appearance-none rounded-md border pr-7 pl-2.5 text-xs",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
      )}
      style={{
        minWidth,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {children}
    </select>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        color: "#16a34a",
        borderColor: "#bbf7d0",
        background: "#f0fdf4",
      }}
    >
      {children}
    </span>
  );
}

function InputMeter() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!isTauri()) {
      const id = setInterval(() => setPct(20 + Math.random() * 70), 100);
      return () => clearInterval(id);
    }
    const id = setInterval(() => {
      getMeter()
        .then((rms) => setPct(Math.min(100, rms * 100)))
        .catch(() => {});
    }, 90);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="bg-muted relative h-1 w-[120px] overflow-hidden rounded-full">
      <div
        className="bg-foreground absolute inset-y-0 left-0 rounded-full transition-[width] duration-90"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
