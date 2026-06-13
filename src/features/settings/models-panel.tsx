import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isTauri, revealModelsDir } from "@/lib/tauri";
import { SettingSection } from "@/components/kit/layout";
import { ParakeetRow } from "@/features/settings/parakeet-row";
import { CleanupRow } from "@/features/settings/cleanup-row";

export function ModelsPanel() {
  async function reveal() {
    if (!isTauri()) {
      toast.info("Folder reveal needs the Tauri runtime");
      return;
    }
    try {
      await revealModelsDir();
    } catch (e) {
      toast.error(`Couldn't open folder: ${(e as Error).message}`);
    }
  }

  return (
    <SettingSection title="Models">
      <ParakeetRow />
      <CleanupRow />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-muted-foreground text-xs">
          Stored on this device under your local app data.
        </span>
        <Button variant="ghost" size="sm" onClick={reveal}>
          <FolderOpen />
          Show in folder
        </Button>
      </div>
    </SettingSection>
  );
}
