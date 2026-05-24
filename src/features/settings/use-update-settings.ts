import { toast } from "sonner";
import { isTauri, updateSettings } from "@/lib/tauri";
import { useMumbleStore } from "@/store";

export function useUpdateSettings() {
  const settings = useMumbleStore((s) => s.settings);
  const setSettings = useMumbleStore((s) => s.setSettings);

  return async (patch: Record<string, unknown>) => {
    if (!isTauri()) {
      if (settings) {
        setSettings({ ...settings, ...(patch as Partial<typeof settings>) });
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
