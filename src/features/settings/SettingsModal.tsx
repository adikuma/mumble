import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { GeneralPanel } from "@/features/settings/general-panel";
import { AudioPanel } from "@/features/settings/audio-panel";
import { AboutPanel } from "@/features/settings/about-panel";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="bg-card border-border fixed top-1/2 left-1/2 z-50 flex max-h-[86vh] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[18px] border shadow-2xl outline-none">
          <div className="border-border flex items-center justify-between border-b px-7 py-4">
            <DialogPrimitive.Title className="text-lg font-semibold">
              Settings
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Configure Mumble
          </DialogPrimitive.Description>
          <div className="overflow-y-auto px-7 py-6 [&::-webkit-scrollbar]:hidden">
            <GeneralPanel />
            <div className="mt-8">
              <AudioPanel />
            </div>
            <div className="mt-8">
              <AboutPanel />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
