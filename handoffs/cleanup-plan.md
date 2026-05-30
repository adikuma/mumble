# Mumble — cleanup execution plan

Source of truth for the cleanup pass. Derived 1:1 from `handoffs/oss-readiness-review.md`. Each task names files, the change, and an acceptance check. No git operations until the human gives a go.

**House rules (applied across every task):**
- comments must be lowercase, no hyphens, no em-dashes, no semicolons as symbols
- no leading-underscore names in any language
- no inline imports (top of file only)
- pnpm only for js, uv only for python
- single-line conventional commit subject when (later) committing
- preserve existing patterns and structure unless the task explicitly says otherwise
- never `git add`, `git commit`, or `git push` in any stage

---

## Stage 1 — Legal + docs unblock (P0)

### 1.1 LICENSE
- Create `LICENSE` at repo root with the Apache-2.0 license text (full, unmodified).
- Set `license = "Apache-2.0"` in `src-tauri/Cargo.toml`.
- Set `"license": "Apache-2.0"` in `package.json`.

### 1.2 NOTICE
- Create `NOTICE` at repo root listing every redistributable third-party component, attribution, and license:
  - Parakeet-TDT-0.6B-v3 by NVIDIA — CC-BY-4.0 (model weights)
  - sherpa-onnx by k2-fsa — Apache-2.0
  - ONNX Runtime by Microsoft — MIT
  - Tauri — Apache-2.0 / MIT dual
  - ort crate — Apache-2.0
  - shadcn/ui — MIT
- Mention that a future Qwen2.5-0.5B cleanup model would be Apache-2.0 if/when integrated.

### 1.3 SECURITY.md
- Create `SECURITY.md` with:
  - private disclosure address (placeholder `security@<TBD>` — flag for the user to fill)
  - SLA: 7-day acknowledgement, 30-day fix-or-disclosure window
  - threat model paragraph: on-device audio capture, keystroke injection, no network egress except model download from huggingface.co, optional clipboard pass-through during paste window (~120 ms)
  - explicit disclosure: a global low-level keyboard hook is installed via `rdev`, no keystrokes are stored
  - link to `NOTES.md`

### 1.4 CONTRIBUTING.md
- Create `CONTRIBUTING.md` covering:
  - commit convention: single-line conventional, never co-author lines
  - comment/naming rules (lowercase, no hyphens/em-dashes/leading-underscores)
  - quality gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`, `cargo fmt && cargo clippy -- -D warnings && cargo test` in `src-tauri/`
  - how to run `bench/` (link `bench/README.md` if present, else write minimal steps)
  - what `models/cleanup/` is (scaffolding, implementation in progress)
  - that every non-obvious fix should add a `NOTES.md` entry

### 1.5 .gitattributes
- Create `.gitattributes`:
  ```
  * text=auto eol=lf
  *.{ps1,cmd,bat} text eol=crlf
  *.{png,ico,icns,onnx,woff2,jpg,jpeg,gif} binary
  ```
- Do NOT renormalize automatically (the human should run `git add --renormalize .` later).

### 1.6 README fixes
- `README.md`: delete the line referencing `/root/.claude/plans/...` (audit finding #4).
- Add a `## Prerequisites` section before any dev section:
  - Rust toolchain via `rustup` (stable)
  - Visual Studio Build Tools 2022 with C++ workload (MSVC)
  - CMake (required by sherpa-onnx C++ build)
  - WebView2 runtime (preinstalled on Windows 11)
  - Node.js >= 20, `pnpm` via `corepack enable`
- Add a `## First run` note: the int8 Parakeet model (~670 MB) downloads from `huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` on first launch.
- Add a `## Known build issues` section linking the sherpa-rs `wmic` failure on Windows 11 24H2+, with the minimal patch instructions until the upstream pin lands.
- Regenerate the repo-layout block from the current `src-tauri/src/` tree, or replace it with a one-paragraph summary + link to a new `docs/architecture.md`.

### 1.7 Crate / identifier rename
- `src-tauri/Cargo.toml`: `name = "mumble"`, `[lib].name = "mumble_lib"`, `authors = ["Aditya Kumar <aditya.kumar@getsolar.ai>"]`.
- `src-tauri/src/main.rs`: replace `mumble_scaffold_lib::run()` with `mumble_lib::run()`.
- `src-tauri/tauri.conf.json`: `identifier = "ai.getsolar.mumble"`, `mainBinaryName = "mumble"` (verify field name in current schema).
- Search for any other `mumble-scaffold` / `mumble_scaffold` occurrences in the repo and update them.

### 1.8 package.json metadata
- Add `"license": "Apache-2.0"`, `"author": "Aditya Kumar <aditya.kumar@getsolar.ai>"`, `"repository": { "type": "git", "url": "git+https://github.com/<owner>/mumble.git" }` (placeholder owner — flag for the human), `"bugs": { "url": "https://github.com/<owner>/mumble/issues" }`.
- Keep `"private": true` for now.

### 1.9 docs/architecture.md
- Create `docs/architecture.md` covering:
  - state machine: Idle → Recording → Transcribing → Pasting → Idle (with how each transition is gated via `AppState::compare_exchange`)
  - IPC surface: list of `#[tauri::command]` handlers in `commands.rs` and matching `mumble://*` event names emitted from `pipeline.rs`
  - data dir layout: `%APPDATA%\Mumble` for settings + history, `%LOCALAPPDATA%\Mumble\models` for ONNX assets
  - sequence: hotkey down → cpal capture → resample → sherpa-onnx → clipboard snapshot → SendInput → clipboard restore
- Keep it ~150 lines, no diagrams (link them later).

### 1.10 .gitignore tweak
- Remove the `AGENTS.md` line from `.gitignore` (the file is tracked anyway).

---

## Stage 2 — Security hardening (P0/P1)

### 2.1 Tauri CSP
- `src-tauri/tauri.conf.json`: replace `"csp": null` with `"csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: https://ipc.localhost https://huggingface.co https://cdn-lfs.huggingface.co; frame-ancestors 'none'"`.
- Confirm with `pnpm tauri dev` after that fonts + IPC + the model download still work.

### 2.2 Model SHA-256 verification
- `src-tauri/src/model_download.rs`: add a `sha256` field to the `ASSETS` table.
- After download (before rename), compute SHA-256 via `sha2::Sha256`; if mismatch, delete the partial and return `anyhow::bail!("hash mismatch for <name>")`.
- Add `sha2 = "0.10"` to `src-tauri/Cargo.toml`.
- Hardcode the three expected digests for the int8 encoder/decoder/joiner (use the HuggingFace LFS `oid` value as the source — TODO in code if the values can't be looked up at edit time; flag for the human).

### 2.3 Tauri capability split
- `src-tauri/capabilities/default.json`: split into `main.json` (scoped `"windows": ["main"]`, allows window-show/hide/maximize, clipboard-manager, etc.) and `indicator.json` (scoped `"windows": ["indicator"]`, only `set_position`, `set_ignore_cursor_events`, `set_always_on_top`).
- The indicator window should not have `allow-show`, `allow-hide`, or the clipboard plugin.

### 2.4 get_app_icon path allowlist
- `src-tauri/src/commands.rs::get_app_icon`: validate `exe_path` against a known prefix set:
  - `%ProgramFiles%`, `%ProgramFiles(x86)%`, `%SystemRoot%`, `%LocalAppData%\Programs`, `%LocalAppData%\Microsoft\WindowsApps`, `%AppData%`.
- Reject anything else with `Err("path not allowed")`.

### 2.5 IconCache LRU bound
- `src-tauri/src/app_icons.rs`: cap `IconCache` at 256 entries via the `lru` crate.
- Add `lru = "0.12"` to `Cargo.toml`.

### 2.6 update_transcript + dictionary size caps
- `src-tauri/src/commands.rs::update_transcript`: cap text at 1 MB (1_048_576 bytes).
- `add_dictionary_entry`: cap `pattern` at 1 KB, `replacement` at 1 KB.
- Return descriptive errors.

### 2.7 Drop unused windows feature
- `src-tauri/Cargo.toml`: remove `Win32_System_Registry` from the windows-crate feature list. Verify with `cargo check`.

### 2.8 Tracing privacy
- `src-tauri/src/transcribe.rs:95`: demote transcript preview log to `tracing::debug!` (or gate behind `MUMBLE_LOG_TRANSCRIPTS=1`).
- `src-tauri/src/paste.rs:48,53`: same treatment.
- `src-tauri/src/pipeline.rs:190,209,229,251,270`: demote every `// TODO cleanup tracing::info!` to `debug` and remove the TODO marker.

---

## Stage 3 — Paste correctness (fixes task #57, P0)

### 3.1 Scancode Ctrl+V via SendInput
- `src-tauri/src/paste.rs::synth_ctrl_v`: stop using `enigo::Key::Unicode('v')`.
- Replace with direct `windows::Win32::UI::Input::KeyboardAndMouse::SendInput` calls using `KEYEVENTF_SCANCODE`:
  - Press Ctrl (scancode 0x1D)
  - Press V (scancode 0x2F)
  - Release V
  - Release Ctrl
- Use the `windows` crate already in deps.

### 3.2 target_app returns HWND
- `src-tauri/src/target_app.rs`: extend the captured value with the raw `HWND` alongside name + path.
- Update the public `TargetApp` (or `ForegroundApp`) struct to add `pub hwnd: isize` (HWND as isize so it stays `Send`).

### 3.3 Re-focus before paste
- `src-tauri/src/paste.rs`: add `focus_target(hwnd: HWND) -> anyhow::Result<()>` that does:
  - `AllowSetForegroundWindow(ASFW_ANY)` on the indicator side just before SetForegroundWindow,
  - `AttachThreadInput(this, target_tid, true)`,
  - `SetForegroundWindow(hwnd)` (retry up to 5 times w/ 10 ms backoff if it returns false),
  - `DetachThreadInput(this, target_tid, false)`.
- Call this right before each `synth_ctrl_v` from `pipeline::paste_chunk`.

### 3.4 Indicator WS_EX_NOACTIVATE
- `src-tauri/src/lib.rs`: after creating the indicator webview, query the raw HWND via `win.hwnd()` and set `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` via `SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)`.

### 3.5 SetWindowPos for show
- `src-tauri/src/pipeline.rs::show_indicator`: replace `win.show()` with a `SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_NOSIZE)` call so the indicator never activates.

### 3.6 Reuse Enigo / scope-guard Ctrl
- After moving to direct `SendInput` in 3.1 enigo isn't needed for paste. If kept anywhere, wrap the press/release pair so Ctrl release fires on every path (RAII guard).
- If `enigo` is no longer needed by anything else, drop it from `Cargo.toml`.

### 3.7 OpenClipboard retry with backoff
- `src-tauri/src/paste.rs`: retry `Clipboard::new()` and `set_text` up to 5 times with 10 ms backoff before returning an error.

### 3.8 Focus-mismatch fallback
- `src-tauri/src/pipeline.rs::paste_chunk`: re-check current foreground HWND immediately before `synth_ctrl_v`. If it differs from the captured HWND and re-focus failed, fall back to `copy_only` and emit `mumble://toast` payload `{ kind: "focus-changed", text: "focus changed, copied to clipboard instead" }`.

---

## Stage 4 — Concurrency unsoundness (P0)

### 4.1 Dedicated capture thread
- `src-tauri/src/audio.rs`: introduce `CaptureWorker` — a `std::thread::spawn` that owns the `cpal::Stream` for its entire lifetime, calls `CoInitializeEx(None, COINIT_MULTITHREADED)` once at start, `CoUninitialize` on shutdown.
- Worker commands via `crossbeam-channel`: `Start`, `Stop`, `Meter(oneshot::Sender<f32>)`, `Take(oneshot::Sender<Vec<f32>>)`.
- Remove `unsafe impl Send for CaptureEngine` + `unsafe impl Sync for CaptureEngine`.

### 4.2 Lock-free audio buffer
- Replace `parking_lot::Mutex<Vec<f32>>` for `rec_buf` with an `rtrb` SPSC ring (or a hand-rolled `triple_buffer`-style structure). The cpal callback only does an atomic-load `recording` then a bounded push.
- The capture worker drains the ring when `Stop` arrives.
- Add `rtrb = "0.3"` to `Cargo.toml`.

### 4.3 Serialize hotkey press/release
- `src-tauri/src/lib.rs`: replace the per-event `tauri::async_runtime::spawn_blocking` dispatch with a single `std::sync::mpsc::sync_channel::<HotkeyEvent>(16)` consumed by one worker thread that calls `pipeline.on_hotkey_press`/`release` synchronously, in order.
- Update `hotkey.rs` to send into that channel instead of invoking the pipeline directly.

### 4.4 catch_unwind on FFI callbacks
- `src-tauri/src/hotkey.rs`: wrap the `rdev::listen` closure body in `std::panic::catch_unwind` + `AssertUnwindSafe`. On caught panic: `tracing::error!`, return.
- `src-tauri/src/audio.rs`: same treatment inside the `cpal::build_input_stream` data callback.

### 4.5 Dedicated paste/clipboard thread
- `src-tauri/src/paste.rs`: spawn a long-lived `PasteWorker` thread on app start that calls `CoInitializeEx(None, COINIT_APARTMENTTHREADED)` once and processes `PasteJob` messages from a `crossbeam-channel`.
- `pipeline::paste_chunk` sends a job and awaits the result via a oneshot.

### 4.6 Atomic AppState repr
- `src-tauri/src/state.rs`: add `#[repr(u8)]` to `AppState`. Add a `debug_assert!` in `from_u8` for out-of-range values.

---

## Stage 5 — Robustness (P1/P2)

### 5.1 Lazy + recoverable HistoryStore open
- `src-tauri/src/lib.rs:36`: stop `.expect("failed to open history.db")`. On `Err`:
  - log the path + error via `tracing::error!`
  - rename the file to `history.db.bak.<unix_ts>` (the unix-ts source must come from a thread-local seed since Date is forbidden in workflow scripts — at runtime use `std::time::SystemTime::now()`)
  - retry once
  - if it still fails, build an in-memory `HistoryStore` so the app boots, and emit `mumble://error { kind: "history-db", recoverable: true }` so the UI can banner it.

### 5.2 Sqlite tuning
- `src-tauri/src/history.rs`: right after `Connection::open` execute:
  - `PRAGMA journal_mode=WAL;`
  - `PRAGMA synchronous=NORMAL;`
  - `PRAGMA busy_timeout=5000;`
  - `PRAGMA foreign_keys=ON;`
- Wrap multi-statement migrations in an explicit transaction.

### 5.3 Atomic settings.json write
- `src-tauri/src/settings.rs::persist`: write to `settings.json.tmp` in the same directory, then `std::fs::rename` over the destination.

### 5.4 Watchdog timeout on stuck state
- `src-tauri/src/pipeline.rs`: after dispatching transcribe + paste, also schedule a 30-second watchdog. If state is still `Recording`/`Transcribing`/`Pasting` after 30 s, reset to `Idle`, hide indicator, emit `mumble://error { kind: "stuck", state: "<state>" }`.

### 5.5 Hotkey listener restart loop
- `src-tauri/src/hotkey.rs`: wrap `rdev::listen` in `loop { ...; sleep(500ms); }` so a crashed hook is automatically restarted. Emit `mumble://hotkey-died` once on the first crash so the UI can banner it.

### 5.6 input device change teardown
- `src-tauri/src/commands.rs::update_settings`: if `prev.input_device != next.input_device`, send a `CaptureWorker::Stop` (or new `SwapDevice`) and let next `ensure_capture` rebuild on the new device.

### 5.7 Transcriber init via spawn_blocking
- `src-tauri/src/lib.rs:109`: separate the async `ensure_model().await` step from the sync `ParakeetTranscriber::new` step — call the new ctor inside `tauri::async_runtime::spawn_blocking`.

### 5.8 Empty samples handling
- `src-tauri/src/pipeline.rs:158`: if `samples.is_empty()`, set state back to Idle, emit `mumble://error { kind: "capture-unavailable" }`, hide indicator, return — do not enter the transcribe path.

### 5.9 uuid for transcript IDs
- `src-tauri/src/pipeline.rs::new_id`: replace nanos-hex with `uuid::Uuid::new_v4().to_string()`. Add `uuid = { version = "1", features = ["v4"] }`.

### 5.10 Models dir → LOCALAPPDATA
- `src-tauri/src/paths.rs`: use `dirs::data_local_dir()` for the models subdir. Keep `settings.json` and `history.db` in roaming.

### 5.11 Drop unused deps + dead code
- `src-tauri/Cargo.toml`: drop `thiserror`, `crossbeam-channel` (if not used after Stage 4 — it IS used after Stage 4, so re-check), `directories`, `hound`.
- Delete `audio.rs::write_wav` and its `#[allow(dead_code)]`.

### 5.12 SettingsPatch struct
- `src-tauri/src/commands.rs::update_settings`: define `#[derive(Deserialize)] #[serde(rename_all = "camelCase", deny_unknown_fields)] struct SettingsPatch { ... }` instead of `serde_json::Value`.
- Validate `preRollMs` against `audio::RING_SECONDS`.

### 5.13 Audio chunker tests
- `src-tauri/src/audio.rs`: add a `#[cfg(test)] mod tests` covering:
  - short input → single slice unchanged
  - long input → no chunk shorter than `chunk_min`
  - overlaps at most `OVERLAP_MS`
  - cuts fall inside the search window

### 5.14 Comment / em-dash cleanup
- `src-tauri/src/tray.rs:24`: replace em-dash with hyphen or colon.
- `src-tauri/src/app_icons.rs:54,104,162,169`: rewrite hyphenated comments to lowercase no-hyphen form (e.g. `null terminated utf16`).

### 5.15 Replace leading-underscore param
- `src-tauri/src/app_icons.rs:205`: change `fn extract_icon(_exe_path: &str)` to `fn extract_icon(exe_path: &str) -> Option<String> { let _ = exe_path; None }`.

### 5.16 Tray strings to consts
- `src-tauri/src/tray.rs`: hoist tray labels into named `const`s near the top of the file.

### 5.17 Paste timing constants
- `src-tauri/src/paste.rs:51,56,84`: hoist `40`, `80`, `70` ms timings into named consts (`PASTE_STAGE_DELAY_MS`, `PASTE_DWELL_MS`, `PASTE_RESTORE_GUARD_MS`).

### 5.18 Stuck/race fixes
- `src-tauri/src/audio.rs::stop_recording`: after the flag flip, re-acquire the lock once and clear any post-flag stragglers.
- `src-tauri/src/pipeline.rs:351` `new_id` collision is covered by 5.9.
- `src-tauri/src/history.rs:140` `list_history` LIKE binding: split into two prepared statements (with vs without query).

### 5.19 delete_model best-effort
- `src-tauri/src/model_download.rs:128-139`: continue past per-file unlink failures, collect errors, bail at the end.

---

## Stage 6 — Frontend polish (P2)

### 6a — Store + architecture

- 6a.1 Delete dead store slices in `src/store.ts`: `appState`, `modelReady`, `error`, `download`, `historyLoading`, `selectedId`, `setSelectedId`, `removeTranscript`, `clearTranscripts`. Remove corresponding setters in `src/lib/useBackendBridge.ts`.
- 6a.2 Delete unused shadcn primitives: `src/components/ui/dialog.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `separator.tsx`. Verify no imports remain.
- 6a.3 Delete unused tauri wrappers in `src/lib/tauri.ts`: `clearHistory`, `repasteTranscript`, `redownloadModel`, `hideMainWindow`, `showMainWindow`, `updateDictionaryEntry`. Check first that the Rust `#[tauri::command]` handlers may stay — only the JS wrappers go.
- 6a.4 Hoist `Page` route type from `src/components/shell/sidebar.tsx` to `src/components/shell/routes.ts` and re-export from there; consume from `App.tsx` and `Sidebar`.
- 6a.5 Add an `ErrorBoundary` component in `src/components/error-boundary.tsx`. Wrap both `MainWindow` and `IndicatorWindow` in it inside `App.tsx`.
- 6a.6 `useBackendBridge`: switch from per-setter selectors + dep array to `useMumbleStore.setState` inside the effect, dep array `[]`.
- 6a.7 Promote `src/features/history/AppIcon.tsx` to `src/components/kit/app-icon.tsx` and `src/features/history/group-helpers.ts` to `src/lib/transcripts.ts`. Delete the empty `features/history/` directory. Update imports.

### 6b — React 19 purity + logic fixes

- 6b.1 Create `src/lib/use-now.ts` that exposes a `useNow(intervalMs = 1000)` hook returning a ticking `Date`-like number from `useEffect`-driven `setInterval` (not read during render). Use it in:
  - `src/features/home/HomeView.tsx::greeting` → compute once on mount via `useState(() => greeting())`.
  - `src/features/home/TranscriptAccordion.tsx::formatRelative` → derive label from `(useNow(60_000), createdAt)` not `Date.now()` at render time.
  - `src/features/home/home-helpers.ts` if it reads `Date` during render.
- 6b.2 `src/features/indicator/IndicatorWindow.tsx`: replace inline `unlistenState`/`unlistenProgress` pattern with the `cancelled` + `unlisteners[]` guard from `useBackendBridge`. On effect cleanup, set `cancelled = true` and call every collected unlistener.
- 6b.3 `src/features/home/HomeView.tsx:32`: guard with `isTauri()`, add `.catch(err => toast.error(...))`. Also delete the duplicate `listHistory` fetch (the bridge already loads it) so Home only re-fetches via `refresh()` after edits.
- 6b.4 `src/features/home/TranscriptAccordion.tsx::saveEdit`: keep `editing=true` until the await resolves; on `catch`, leave the textarea open with the draft preserved. Add a `saving` state to disable Save while in-flight.
- 6b.5 `src/features/insights/InsightsView.tsx`: switch effect deps from `[transcripts.length]` to `[transcripts]`.
- 6b.6 `src/features/dictionary/DictionaryView.tsx`: wrap `add()` and `remove()` in `try { ... } catch (err) { toast.error(...) }`.
- 6b.7 `src/features/home/TranscriptAccordion.tsx`: track the highlight `setTimeout` in a `useRef`; clear it on cleanup and on re-edit.
- 6b.8 `src/features/settings/use-update-settings.ts`: type the returned function as `(patch: Partial<Settings>) => Promise<void>`, drop the `Record<string, unknown>` cast.

### 6c — Tokens, styling, and remaining polish

- 6c.1 `src/features/indicator/MicIndicator.tsx`: replace every hardcoded hex/rgba with token references — `bg-card`/`bg-popover`/`border-border` for the pill, `hsl(var(--primary))` for the purple, `hsl(var(--destructive))` for the dot reds. Remove the gradient + lift shadow (or extract a single `--indicator-shadow` token in both modes). Replace `rounded-[12px]` with `rounded-xl`. Fix `var(--foreground)` → `hsl(var(--foreground))` at line 64.
- 6c.2 `src/components/ui/button.tsx`: add a `destructive-outline` variant using `hsl(var(--destructive))` for border/text on hover.
- 6c.3 `src/features/home/TranscriptAccordion.tsx:208`: replace raw `red-200`/`red-50`/`red-700` with `variant="destructive-outline"`.
- 6c.4 `src/index.css:100`: set `--popover-foreground: 0 0% 9%;` so light-mode dropdowns inherit the warm-neutral text.
- 6c.5 `src/index.css:118,158`: either expose `--border-strong` via `--color-border-strong` in `@theme inline` AND adopt it somewhere, OR delete both declarations.
- 6c.6 Append a `@media (prefers-reduced-motion: reduce)` block to `src/index.css` that zeroes `--animate-accordion-down`/`--animate-accordion-up`, disables `mumble-flash`, and (via a Tailwind config note) instructs the waveform to use `motion-safe:transition-[height]` in `MicIndicator.tsx`.
- 6c.7 `src/features/insights/InsightsView.tsx:244`: parse heatmap day as UTC (`new Date(days[0].day + "T00:00:00Z").getUTCDay()`).
- 6c.8 `src/features/insights/InsightsView.tsx:21`: stop importing `avgWpmThisWeek` from `features/home/...`. Either move it to `src/lib/stats.ts` and consume from both views, OR drop the client recompute (add `avgWpm` to `InsightsData` in `commands.rs::get_insights`).
- 6c.9 `src/lib/tauri.ts:177`: simplify `getAppIcon` (drop the redundant `?? null`).
- 6c.10 `src/features/dictionary/DictionaryView.tsx`: `useMemo` the filtered list keyed on `[dict, query]`.
- 6c.11 `src/features/indicator/MicIndicator.tsx`: replace `setInterval(getMeter, 50)` with a recursive `setTimeout` that only schedules the next call after the prior resolves; log persistent failures.
- 6c.12 `src/features/indicator/MicIndicator.tsx`: add a `useEffect` keyed on `[bars]` that resets the heights array length.
- 6c.13 `src/features/indicator/IndicatorWindow.tsx:25-31`: consume `resolvedTheme` from `useTheme()` instead of recomputing `window.matchMedia` at render time.
- 6c.14 `src/components/theme-provider.tsx:11`: lazily compute the media query inside the provider or guard with `typeof window !== "undefined"`.
- 6c.15 `src/components/shell/window-controls.tsx:18-37`: replace silent `.catch(() => {})` with a logged warning (no spammy toast for transient cases).
- 6c.16 `src/lib/useBackendBridge.ts:86-91`: if `settings` is null on a settings-changed event, re-fetch via `getSettings` rather than dropping the patch.

---

## Stage 7 — Misc polish (P3)

- 7.1 `BENCHMARK.md`: add a `## Model` section linking the Parakeet model card, license, training data origin in one line, known limitations.
- 7.2 Move `docs/design-from-claude/` to `docs/archive/design-from-claude/` and add a one-line `docs/archive/README.md` explaining it is frozen. If the duplicated `Geist-Variable.woff2` exists inside the archive, delete that one (keep `public/fonts/`).
- 7.3 `git rm` cached bench log artifacts: `bench/install.log`, `bench/install-llm.log`, `bench/download.log`, `bench/llm_run.log` — NO. **No git operations.** Instead: locate and delete the working-tree files directly; the human can `git rm` them later.
- 7.4 `models/cleanup/README.md`: add a prominent `> Status: scaffolding — implementation in progress` callout at the very top.
- 7.5 `src-tauri/src/commands.rs`: add a one-liner rustdoc `///` above every `#[tauri::command]` (input, output, side effects, matching emit).
- 7.6 `src/App.tsx`: wrap each main view in `React.lazy` and a `Suspense` fallback.
- 7.7 `src-tauri/src/paste.rs`: call `SetClipboardData(CF_PRIVATEFIRST, ...)` so Windows clipboard history does not log the transcript.

---

## Verify

After all stages: run from `mumble/`:
```
pnpm format
pnpm typecheck
pnpm lint
pnpm build
```
And from `src-tauri/`:
```
cargo fmt
cargo clippy --no-default-features -- -D warnings
cargo build --no-default-features
```
Surface any errors to the user before declaring done.

---

## What this plan deliberately does NOT do

- Run `git add`, `git commit`, `git push`, or any branch operations.
- Run `pnpm tauri dev` (user runs that themselves to live-test).
- Implement anything inside `models/cleanup/src/cleanup/*.py` or `models/cleanup/scripts/0N_*.py` — those stay scaffolding; the user is writing them.
- Touch the `bench/` model files, datasets, or change any pinned versions there.
- Change the design language (no glass, no bevels, no token-system overhaul beyond fixes already documented above).
- Run any model download or remote network operation.
