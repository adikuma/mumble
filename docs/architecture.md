# Mumble architecture

A high-level walk through the moving pieces of the Rust backend and the React frontend, intended for new contributors.

## State machine

The pipeline is gated by a single atomic `AppState` (see `src-tauri/src/state.rs`). Every transition uses `compare_exchange` so concurrent paths cannot stomp each other.

```
            press                 release            transcribed       paste-done
   Idle ───────────► Recording ──────────► Transcribing ────────► Pasting ──────────► Idle
     ▲                   │                                                                │
     │                   └── error / empty samples ──► Idle (with mumble://error emit) ◄──┘
     │                                                                                    │
     └────────────────────────────── reset / cancel ─────────────────────────────────────┘
```

- **Idle → Recording.** Hotkey press; `pipeline::on_hotkey_press` flips state and starts WASAPI capture into the ring buffer.
- **Recording → Transcribing.** Hotkey release; capture is stopped and the buffered samples are handed to sherpa-onnx.
- **Transcribing → Pasting.** Sherpa returns text; clipboard is snapshotted and the transcript is staged.
- **Pasting → Idle.** `Ctrl+V` is synthesized against the previously-focused window and the clipboard is restored.

Illegal transitions are no-ops. Errors short-circuit back to Idle and emit `mumble://error`.

## IPC surface

All commands live in `src-tauri/src/commands.rs`. Each is a `#[tauri::command]` invoked from the frontend via `src/lib/tauri.ts`.

| Handler                     | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `get_settings`              | Read the current `Settings` snapshot                    |
| `update_settings`           | Merge a partial patch into persisted settings           |
| `list_input_devices`        | Enumerate WASAPI capture devices                        |
| `capture_hotkey`            | Block-listen for one keypress and return its label      |
| `get_state`                 | Read the current `AppState`                             |
| `get_meter`                 | Read the latest input level (0.0 to 1.0)                |
| `list_history`              | Paginated transcript list, optional search query        |
| `delete_transcript`         | Remove one transcript by id                             |
| `clear_history`             | Truncate the transcripts table                          |
| `copy_transcript`           | Copy a stored transcript onto the clipboard             |
| `repaste_transcript`        | Re-run the paste flow against the focused app           |
| `hide_main_window`          | Hide the main webview                                   |
| `show_main_window`          | Show and focus the main webview                         |
| `redownload_model`          | Force a fresh model download                            |
| `model_status`              | Inspect on-disk model presence and size                 |
| `get_insights`              | Aggregated stats for the insights view                  |
| `get_app_icon`              | Return a base64 PNG of an exe's icon                    |
| `list_dictionary`           | List user dictionary entries                            |
| `add_dictionary_entry`      | Insert a pattern to replacement mapping                 |
| `update_dictionary_entry`   | Edit an existing mapping                                |
| `delete_dictionary_entry`   | Remove one mapping                                      |
| `update_transcript`         | Edit a stored transcript's text                         |

Events flow the other direction. The backend emits the following on the global Tauri event bus.

| Event                       | Emitter                       | Payload                                  |
| --------------------------- | ----------------------------- | ---------------------------------------- |
| `mumble://state-changed`    | `pipeline.rs`                 | `{ state: AppState }`                    |
| `mumble://transcribed`      | `pipeline.rs`                 | `{ id, text, app, durationMs, wpm, ... }`|
| `mumble://chunk-progress`   | `pipeline.rs`                 | `{ chunk, total }`                       |
| `mumble://error`            | `pipeline.rs`, `lib.rs`       | `{ message }` or `{ kind, ... }`         |
| `mumble://ready`            | `lib.rs`                      | `{ ready: bool }`                        |
| `mumble://download-progress`| `model_download.rs`           | `{ name, received, total }`              |
| `mumble://settings-changed` | `tray.rs`                     | empty                                    |

## Data directories

Mumble writes user data to two Windows directories.

- **`%APPDATA%\Mumble\`** (roaming) — `settings.json` and `history.db`. Travel with the user's roaming profile.
- **`%LOCALAPPDATA%\Mumble\models\`** — ONNX encoder, decoder, joiner, and tokens for the Parakeet-TDT model. Local because the files are large (~670 MB) and machine-specific.

Path resolution lives in `src-tauri/src/paths.rs`.

## End-to-end sequence

A single push-to-talk cycle touches almost every module in the backend.

1. **Hotkey down.** The `rdev` global keyboard hook in `hotkey.rs` matches the configured binding and dispatches `on_hotkey_press` on a worker.
2. **Capture start.** `audio.rs` starts a cpal WASAPI input stream into a ring buffer with a 1 s pre-roll head, so the first few words spoken before the user fully presses the hotkey are still captured.
3. **Indicator show.** `pipeline.rs` reveals the indicator webview and seeds the level meter from `get_meter`.
4. **Hotkey up.** `on_hotkey_release` stops capture, drains the ring buffer, and resamples to 16 kHz mono.
5. **Transcribe.** `transcribe.rs` feeds the samples to sherpa-onnx's Parakeet-TDT transcriber and returns a string.
6. **Snapshot clipboard.** `paste.rs` reads the current clipboard text into memory.
7. **Stage transcript.** The transcript is written to the clipboard (after passing through the user dictionary in `dictionary.rs`).
8. **Re-focus and paste.** `target_app.rs` recalls the foreground window captured at press time; `paste.rs` synthesizes `Ctrl+V` via `SendInput`.
9. **Restore clipboard.** After a short dwell, the original clipboard contents are written back.
10. **Persist.** `history.rs` stores the transcript with timestamp, target app, and duration. `mumble://transcribed` is emitted so the UI can update.

## Frontend overview

The webview UI is a single Vite + React 19 SPA with two roots: the main window (history, settings, insights, dictionary) and the indicator window. State is held in a single Zustand store (`src/store.ts`) and synced to backend events via `src/lib/useBackendBridge.ts`. Theming uses `next-themes` with light/dark CSS variables defined in `src/index.css`. Component primitives live in `src/components/ui/` (shadcn-style) and are composed by feature modules under `src/features/`.
