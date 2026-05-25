import { GeneralPanel } from "@/features/settings/general-panel";
import { AppearancePanel } from "@/features/settings/appearance-panel";
import { AudioPanel } from "@/features/settings/audio-panel";
import { AboutPanel } from "@/features/settings/about-panel";
import { Page, PageHeader } from "@/components/kit/layout";

export function SettingsView() {
  return (
    <Page>
      <PageHeader
        title="Settings"
        description="How Mumble listens, pastes, and stays out of your way."
      />

      <div className="mt-7">
        <GeneralPanel />
      </div>
      <div className="mt-8">
        <AppearancePanel />
      </div>
      <div className="mt-8">
        <AudioPanel />
      </div>
      <div className="mt-8">
        <AboutPanel />
      </div>
    </Page>
  );
}
