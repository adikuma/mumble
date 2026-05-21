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
  autoPaste: boolean;
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

export interface DeviceInfo {
  name: string;
  isDefault: boolean;
}

export interface ModelStatus {
  present: boolean;
  path: string;
  name: string;
}

export interface DownloadProgress {
  filename: string;
  downloaded: number;
  total: number;
  done: boolean;
}

export interface DailyBucket {
  day: string;
  count: number;
}

export interface TopEntry {
  label: string;
  count: number;
}

export interface InsightsData {
  words: number;
  sessions: number;
  avgLatencyMs: number | null;
  timeSavedSec: number;
  dailyActivity: DailyBucket[];
  topApps: TopEntry[];
  topWords: TopEntry[];
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

export const getState = (): Promise<AppState> => safeInvoke("get_state");
export const getMeter = (): Promise<number> => safeInvoke("get_meter");

export const listHistory = (
  query?: string,
  limit = 500,
): Promise<Transcript[]> => safeInvoke("list_history", { query, limit });

export const deleteTranscript = (id: string): Promise<void> =>
  safeInvoke("delete_transcript", { id });

export const clearHistory = (): Promise<void> => safeInvoke("clear_history");

export const copyTranscript = (id: string): Promise<void> =>
  safeInvoke("copy_transcript", { id });

export const repasteTranscript = (id: string): Promise<void> =>
  safeInvoke("repaste_transcript", { id });

export const hideMainWindow = (): Promise<void> =>
  safeInvoke("hide_main_window");
export const showMainWindow = (): Promise<void> =>
  safeInvoke("show_main_window");

export const modelStatus = (): Promise<ModelStatus> =>
  safeInvoke("model_status");
export const redownloadModel = (): Promise<void> =>
  safeInvoke("redownload_model");

export const getInsights = (rangeDays = 7): Promise<InsightsData> =>
  safeInvoke("get_insights", { rangeDays });

export const getAppIcon = async (exePath: string): Promise<string | null> => {
  const result = await safeInvoke<string | null>("get_app_icon", { exePath });
  return result ?? null;
};

export interface StateChangedEvent {
  state: AppState;
}
export interface TranscribedEvent {
  transcript: Transcript;
}
export interface ErrorEvent {
  message: string;
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
