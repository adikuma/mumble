import { GeneralPanel } from "@/features/settings/general-panel";
import { AppearancePanel } from "@/features/settings/appearance-panel";
import { AudioPanel } from "@/features/settings/audio-panel";
import { AboutPanel } from "@/features/settings/about-panel";

export function SettingsView() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-9 pb-9">
      <div className="sticky top-0 z-10 -mx-9 px-9 pt-9 pb-4">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          How Mumble listens, pastes, and stays out of your way.
        </p>
      </div>

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
    </div>
  );
}
