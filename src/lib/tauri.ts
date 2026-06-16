import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AppState = "idle" | "recording" | "transcribing" | "pasting";

export interface Settings {
  hotkey: string;
  inputDevice: string | null;
  launchAtLogin: boolean;
  startMinimized: boolean;
  theme: string;
  paused: boolean;
  preRollMs: number;
  cleanupEnabled: boolean;
}

export interface Transcript {
  id: string;
  createdAt: string;
  durationSec: number;
  text: string;
  inputDevice: string | null;
  model: string;
  latencyMs?: number | null;
  targetApp?: string | null;
  targetAppPath?: string | null;
}

export interface DictEntry {
  id: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  fuzzy: boolean;
}

export interface Correction {
  original: string;
  corrected: string;
}

export interface DeviceInfo {
  name: string;
  isDefault: boolean;
}

export interface ModelStatus {
  present: boolean;
  path: string;
  name: string;
}

export interface CleanupStatus {
  present: boolean;
  path: string;
  name: string;
  sizeBytes: number;
  availableDiskBytes: number;
  requiredDiskBytes: number;
}

export interface DownloadProgress {
  filename: string;
  downloaded: number;
  total: number;
  done: boolean;
}

export interface CleanupDownloadProgress {
  filename: string;
  downloaded: number;
  total: number;
  aggregateDownloaded: number;
  aggregateTotal: number;
  done: boolean;
}

export interface TopEntry {
  label: string;
  count: number;
}

/** one point on the trend axis (a day, or an hour for the Day range). */
export interface Bucket {
  label: string;
  words: number;
  dictations: number;
  durationSec: number;
  wpm: number | null;
  latencyMs: number | null;
}

export interface HourHeat {
  matrix: number[][]; // 7 rows (Mon..Sun) x 24 cols (0..23), dictation counts
  max: number;
}

export interface InsightsData {
  words: number;
  sessions: number;
  avgLatencyMs: number | null;
  timeSavedSec: number;
  topWords: TopEntry[];
  series: Bucket[];
  heatmap: HourHeat;
  streak: number;
  pace: number | null;
  fastest: number | null;
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `invoke("${cmd}") called outside Tauri runtime — running in browser dev?`,
    );
  }
  return invoke<T>(cmd, args);
}

export const getSettings = (): Promise<Settings> => safeInvoke("get_settings");

export const updateSettings = (patch: Partial<Settings>): Promise<Settings> =>
  safeInvoke("update_settings", { patch });

export const listInputDevices = (): Promise<DeviceInfo[]> =>
  safeInvoke("list_input_devices");

export const captureHotkey = (): Promise<string> =>
  safeInvoke("capture_hotkey");

export const getMeter = (): Promise<number> => safeInvoke("get_meter");

export const listHistory = (
  query?: string,
  limit = 500,
): Promise<Transcript[]> => safeInvoke("list_history", { query, limit });

export const deleteTranscript = (id: string): Promise<void> =>
  safeInvoke("delete_transcript", { id });

export const copyTranscript = (id: string): Promise<void> =>
  safeInvoke("copy_transcript", { id });

export const updateTranscript = (
  id: string,
  text: string,
): Promise<Correction[]> => safeInvoke("update_transcript", { id, text });

export const listDictionary = (): Promise<DictEntry[]> =>
  safeInvoke("list_dictionary");

export const addDictionaryEntry = (
  pattern: string,
  replacement: string,
  caseSensitive = false,
  fuzzy = false,
): Promise<DictEntry> =>
  safeInvoke("add_dictionary_entry", {
    pattern,
    replacement,
    caseSensitive,
    fuzzy,
  });

export const deleteDictionaryEntry = (id: number): Promise<void> =>
  safeInvoke("delete_dictionary_entry", { id });

export const modelStatus = (): Promise<ModelStatus> =>
  safeInvoke("model_status");

export const downloadParakeetModel = (): Promise<void> =>
  safeInvoke("download_parakeet_model");

export const cleanupStatus = (): Promise<CleanupStatus> =>
  safeInvoke("cleanup_status");

export const downloadCleanupModel = (): Promise<void> =>
  safeInvoke("download_cleanup_model");

export const cancelCleanupDownload = (): Promise<void> =>
  safeInvoke("cancel_cleanup_download");

export const deleteCleanupModel = (): Promise<void> =>
  safeInvoke("delete_cleanup_model");

export const revealModelsDir = (): Promise<void> =>
  safeInvoke("reveal_models_dir");

export const getInsights = (rangeDays = 7): Promise<InsightsData> =>
  safeInvoke("get_insights", { rangeDays });

export const getAppIcon = (exePath: string): Promise<string | null> =>
  safeInvoke<string | null>("get_app_icon", { exePath });

export interface StateChangedEvent {
  state: AppState;
}
export interface TranscribedEvent {
  transcript: Transcript;
}
export interface ErrorEvent {
  message: string;
}

export interface ToastEvent {
  kind: string;
  text: string;
}

export interface ChunkProgressEvent {
  current: number;
  total: number;
}

export const onStateChanged = (
  handler: (e: StateChangedEvent) => void,
): Promise<UnlistenFn> =>
  listen<StateChangedEvent>("mumble://state-changed", (evt) =>
    handler(evt.payload),
  );

export const onTranscribed = (
  handler: (e: TranscribedEvent) => void,
): Promise<UnlistenFn> =>
  listen<TranscribedEvent>("mumble://transcribed", (evt) =>
    handler(evt.payload),
  );

export const onError = (
  handler: (e: ErrorEvent) => void,
): Promise<UnlistenFn> =>
  listen<ErrorEvent>("mumble://error", (evt) => handler(evt.payload));

export const onToast = (
  handler: (e: ToastEvent) => void,
): Promise<UnlistenFn> =>
  listen<ToastEvent>("mumble://toast", (evt) => handler(evt.payload));

export const onDownloadProgress = (
  handler: (e: DownloadProgress) => void,
): Promise<UnlistenFn> =>
  listen<DownloadProgress>("mumble://download-progress", (evt) =>
    handler(evt.payload),
  );

export const onReady = (
  handler: (payload: { ready: boolean }) => void,
): Promise<UnlistenFn> =>
  listen<{ ready: boolean }>("mumble://ready", (evt) => handler(evt.payload));

export const onSettingsChanged = (
  handler: (payload: Partial<Settings>) => void,
): Promise<UnlistenFn> =>
  listen<Partial<Settings>>("mumble://settings-changed", (evt) =>
    handler(evt.payload),
  );

export const onChunkProgress = (
  handler: (e: ChunkProgressEvent) => void,
): Promise<UnlistenFn> =>
  listen<ChunkProgressEvent>("mumble://chunk-progress", (evt) =>
    handler(evt.payload),
  );

export const onCleanupDownloadProgress = (
  handler: (e: CleanupDownloadProgress) => void,
): Promise<UnlistenFn> =>
  listen<CleanupDownloadProgress>("mumble://cleanup-download-progress", (evt) =>
    handler(evt.payload),
  );
