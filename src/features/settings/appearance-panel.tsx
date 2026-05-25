import { ThemeToggle } from "@/components/theme-toggle";
import { SettingRow } from "@/features/settings/setting-row";

export function AppearancePanel() {
  return (
    <>
      <h2 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.07em] uppercase">
        Appearance
      </h2>
      <div className="bg-card/68 border-border surface-3d shadow-lift overflow-hidden rounded-[13px] border backdrop-blur-md">
        <SettingRow title="Theme" desc="Switch between light and dark.">
          <ThemeToggle />
        </SettingRow>
      </div>
    </>
  );
}
