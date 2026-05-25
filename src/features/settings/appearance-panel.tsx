import { ThemeToggle } from "@/components/theme-toggle";
import { SettingSection } from "@/components/kit/layout";
import { SettingRow } from "@/features/settings/setting-row";

export function AppearancePanel() {
  return (
    <SettingSection title="Appearance">
      <SettingRow title="Theme" desc="Switch between light and dark.">
        <ThemeToggle />
      </SettingRow>
    </SettingSection>
  );
}
