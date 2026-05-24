import { SettingRow } from "@/features/settings/setting-row";

export function AboutPanel() {
  return (
    <>
      <h2 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.07em] uppercase">
        About
      </h2>
      <SettingRow
        title="Version"
        desc="Mumble is local-first. Your audio and transcripts never leave your machine."
      >
        <span className="text-sm font-medium tabular-nums">v0.1.0</span>
      </SettingRow>
      <SettingRow
        title="Model"
        desc="Parakeet-TDT v3, running fully on-device."
      >
        <span className="kbd">Local</span>
      </SettingRow>
    </>
  );
}
