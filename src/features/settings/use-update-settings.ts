import { toast } from "sonner";
import { isTauri, updateSettings, type Settings } from "@/lib/tauri";
import { useMumbleStore } from "@/store";

export function useUpdateSettings(): (
  patch: Partial<Settings>,
) => Promise<void> {
  const settings = useMumbleStore((s) => s.settings);
  const setSettings = useMumbleStore((s) => s.setSettings);

  return async (patch: Partial<Settings>) => {
    if (!isTauri()) {
      if (settings) {
        setSettings({ ...settings, ...patch });
      }
      return;
    }
    try {
      setSettings(await updateSettings(patch));
    } catch (e) {
      toast.error(`Settings update failed: ${(e as Error).message}`);
    }
  };
}
