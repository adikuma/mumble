import { create } from "zustand";
import type { DownloadProgress, Settings, Transcript } from "@/lib/tauri";

interface MumbleStore {
  settings: Settings | null;
  transcripts: Transcript[];

  setSettings: (s: Settings) => void;
  setTranscripts: (list: Transcript[]) => void;
  addTranscript: (t: Transcript) => void;

  // speech model readiness. null means we have not checked yet so the home view
  // can avoid flashing a download banner before status is known.
  modelReady: boolean | null;
  downloadProgress: DownloadProgress | null;
  setModelReady: (ready: boolean) => void;
  setDownloadProgress: (p: DownloadProgress | null) => void;

  appIcons: Record<string, string | null>;
  setAppIcon: (exePath: string, icon: string | null) => void;
}

export const useMumbleStore = create<MumbleStore>((set) => ({
  settings: null,
  transcripts: [],

  setSettings: (settings) => set({ settings }),
  setTranscripts: (transcripts) => set({ transcripts }),

  modelReady: null,
  downloadProgress: null,
  setModelReady: (modelReady) => set({ modelReady }),
  setDownloadProgress: (downloadProgress) => set({ downloadProgress }),

  addTranscript: (t) =>
    set((s) => {
      // ignore if a transcript with this id is already present. guards against
      // an event firing more than once so the list never shows duplicates.
      if (s.transcripts.some((x) => x.id === t.id)) return s;
      return { transcripts: [t, ...s.transcripts] };
    }),

  appIcons: {},
  setAppIcon: (exePath, icon) =>
    set((s) =>
      // returning the same state object skips the store notify, so many
      // rows resolving the same icon only re-render subscribers once.
      s.appIcons[exePath] === icon
        ? s
        : { appIcons: { ...s.appIcons, [exePath]: icon } },
    ),
}));
