import { create } from "zustand";
import type { AppState, Settings, Transcript } from "@/lib/tauri";

interface MumbleStore {
  appState: AppState;
  modelReady: boolean;
  error: string | null;

  settings: Settings | null;

  transcripts: Transcript[];
  selectedId: string | null;
  historyLoading: boolean;

  download: {
    filename: string;
    downloaded: number;
    total: number;
  } | null;

  setAppState: (s: AppState) => void;
  setModelReady: (ready: boolean) => void;
  setError: (msg: string | null) => void;
  setSettings: (s: Settings) => void;
  setTranscripts: (list: Transcript[]) => void;
  addTranscript: (t: Transcript) => void;
  removeTranscript: (id: string) => void;
  clearTranscripts: () => void;
  setSelectedId: (id: string | null) => void;
  setHistoryLoading: (loading: boolean) => void;
  setDownload: (d: MumbleStore["download"]) => void;

  appIcons: Record<string, string | null>;
  setAppIcon: (exePath: string, icon: string | null) => void;
}

export const useMumbleStore = create<MumbleStore>((set) => ({
  appState: "idle",
  modelReady: false,
  error: null,
  settings: null,
  transcripts: [],
  selectedId: null,
  historyLoading: false,
  download: null,

  setAppState: (appState) => set({ appState }),
  setModelReady: (modelReady) => set({ modelReady }),
  setError: (error) => set({ error }),
  setSettings: (settings) => set({ settings }),
  setTranscripts: (transcripts) =>
    set((s) => ({
      transcripts,
      selectedId:
        s.selectedId && transcripts.some((t) => t.id === s.selectedId)
          ? s.selectedId
          : (transcripts[0]?.id ?? null),
    })),
  addTranscript: (t) =>
    set((s) => {
      // ignore if a transcript with this id is already present. guards against
      // an event firing more than once so the list never shows duplicates.
      if (s.transcripts.some((x) => x.id === t.id)) return s;
      return {
        transcripts: [t, ...s.transcripts],
        selectedId: s.selectedId ?? t.id,
      };
    }),
  removeTranscript: (id) =>
    set((s) => {
      const transcripts = s.transcripts.filter((t) => t.id !== id);
      return {
        transcripts,
        selectedId:
          s.selectedId === id ? (transcripts[0]?.id ?? null) : s.selectedId,
      };
    }),
  clearTranscripts: () => set({ transcripts: [], selectedId: null }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setDownload: (download) => set({ download }),

  appIcons: {},
  setAppIcon: (exePath, icon) =>
    set((s) => ({ appIcons: { ...s.appIcons, [exePath]: icon } })),
}));
