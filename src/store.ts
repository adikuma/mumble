import { create } from "zustand";
import type { AppState, Settings, Transcript } from "@/lib/tauri";

interface MumbleStore {
  // Pipeline state
  appState: AppState;
  modelReady: boolean;
  error: string | null;

  // Settings (reflected from backend)
  settings: Settings | null;

  // History
  transcripts: Transcript[];
  historyQuery: string;
  selectedId: string | null;
  historyLoading: boolean;

  // Download progress (first-run model)
  download: {
    filename: string;
    downloaded: number;
    total: number;
  } | null;

  // Actions
  setAppState: (s: AppState) => void;
  setModelReady: (ready: boolean) => void;
  setError: (msg: string | null) => void;
  setSettings: (s: Settings) => void;
  setTranscripts: (list: Transcript[]) => void;
  addTranscript: (t: Transcript) => void;
  removeTranscript: (id: string) => void;
  clearTranscripts: () => void;
  setHistoryQuery: (q: string) => void;
  setSelectedId: (id: string | null) => void;
  setHistoryLoading: (loading: boolean) => void;
  setDownload: (d: MumbleStore["download"]) => void;
}

export const useMumbleStore = create<MumbleStore>((set) => ({
  appState: "idle",
  modelReady: false,
  error: null,
  settings: null,
  transcripts: [],
  historyQuery: "",
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
    set((s) => ({
      transcripts: [t, ...s.transcripts],
      selectedId: s.selectedId ?? t.id,
    })),
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
  setHistoryQuery: (historyQuery) => set({ historyQuery }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setDownload: (download) => set({ download }),
}));
