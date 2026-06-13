# Mumble Notes

Continual log of bug fixes, design decisions, and learnings. Newest entries on top.

---

## 2026-06-14: mockup/insights-brutalist - cleanup model inference wired (ort + tokenizer)

### What
Wired the optional cleanup model (qwen2.5-0.5b fp32 onnx) so the toggle actually polishes dictation. raw "um so like i was uh uh thinking maybe we could meet tomorrow you know" cleans to "I was thinking maybe we could meet tomorrow. You know." new module `cleanup_infer.rs`: loads the onnx session + tokenizer, builds the chatml prompt for the fixed system+user case (no jinja), greedy kv-cache decode threading present.* back to past_key_values.*, stops on eos, max_new = min(256, max(8, raw*1.6)), 8s budget.

### Runtime: separate modern onnxruntime, not sherpa's
sherpa-rs 0.6 bundles onnxruntime 1.14 (2023), far too old to run a modern model export or pair with a modern ort crate. so the cleanup model uses its own runtime: the `ort` crate with `load-dynamic` (it links no onnxruntime itself) loads a modern onnxruntime.dll (1.26, bundled as a tauri resource) via ORT_DYLIB_PATH, set once at startup in lib.rs. two runtimes coexist: sherpa keeps its 1.14, cleanup gets 1.26, no link or name clash.

### Gotchas
- ort 2.0.0-rc.12 fails to compile (an ungated vitis EP module references a missing ort-sys binding). pinned `=2.0.0-rc.10`.
- ort's `Tensor::from_array` rejects a 0 dimension, so the empty past_key_values for the prefill step (shape [1,2,0,64]) cannot be built that way. use `Tensor::new(&Allocator::default(), shape)` for empty kv, `from_array` for non-empty. this is the standard optimum decoder-with-past prefill.
- the onnxruntime.dll is gitignored (16mb). prod/ci builds need it provisioned at src-tauri/resources/onnxruntime.dll (copy from a pip onnxruntime install or the official ort release) before `tauri build` bundles it.

### Pipeline integration
- Pipeline holds Option<Arc<CleanupModel>>, lazy loaded on first dictation when the toggle is on (~2gb ram, ~2s load), dropped on toggle off (commands.rs).
- when cleanup is on the chunk loop only accumulates (no streaming paste), then the full transcript is cleaned once and pasted in a single shot. any failure (model absent, load error, 8s timeout) falls back to pasting the raw transcript. default (toggle off) path is unchanged, still streams per chunk.

### Verified
- cleanup_smoke test (cargo test cleanup_smoke -- --ignored) runs the real 2gb model end to end and prints the cleaned output. 23 unit tests pass, clippy clean.
- remaining manual check: toggle cleanup on in the app and dictate a filler-heavy sentence to confirm the live paste path (cannot synthesize a real voice dictation here).

## 2026-06-10: mockup/insights-brutalist - full codebase sweep (frontend + backend cleanup)

### What
Ran a multi-agent review sweep (6 dimensions, adversarially verified) over src/ and src-tauri/src/ and applied the 40 confirmed findings. Highlights:

### Backend correctness
- pipeline.rs: the 30s watchdog could reset a newer recording session. added a generation counter to SharedState (state.rs), bumped on each idle to recording transition; the watchdog now only fires for its own session and never for Recording (which can only belong to a newer one).
- paste.rs: PasteJob::Shutdown was a no op so PasteClientInner::drop would deadlock on join (masked only by tauri's process::exit). run_paste_worker now breaks on Shutdown like audio.rs.
- paste.rs: restore_clipboard(None) called cb.clear(), destroying non text clipboard content (images, files). now leaves it untouched, and the Some branch uses the retry helper and propagates errors.
- download.rs: is_active then begin was a check then act race allowing two concurrent downloads into the same files. replaced with atomic try_begin under one lock.
- download.rs: progress emitted per network chunk (30k to 250k events for the 2 GB model). throttled to ~1 MB steps.
- commands.rs: capture_hotkey was a sync command blocking the event loop for up to 30s. now async + spawn_blocking.
- history.rs: update_transcript_text used .ok() which reported real db errors as "not found". switched to .optional().
- model_download.rs: the three parakeet onnx assets shipped TODO_ placeholder sha256, so the core model downloaded unverified. pinned real digests (cross checked HF lfs pointer against the local files) and removed the TODO_ escape hatch in download.rs.

### Frontend correctness
- InsightsView: getInsights effect had no cancellation guard, so a stale range response could clobber newer data. added a stale flag, and the catch now logs instead of nulling to the empty state.
- DailyWordsChart: a stale hover index crashed the whole window when the series shrank on range change. clamped.
- onError and onToast (mumble://error, mumble://toast) were emitted by the backend but never listened for, so failed dictations and the focus changed clipboard fallback were silent. wired both into the bridge as toasts.
- listener leak guards (cancelled flag) added to parakeet-row, use-cleanup-download, window-controls to match the bridge pattern.
- app-icon: N history rows for the same app fired N concurrent ipc calls. added a module level in flight Map, plus a store identity guard so repeated icon resolves do not re render.

### Cleanup and consistency
- deleted dead modules: insights-helpers.ts, home-helpers.ts, formatRelative, getState wrapper, dailyActivity/topApps/DailyBucket (backend + ts).
- consolidated duplicated startOfDay/MS_PER_DAY/wordCount/avgWpm/fastestWpm into lib/stats.ts (were copied across 3 modules).
- shared focusRing constant applied to all raw buttons; shared CardHeader for insights cards; renamed useBackendBridge.ts to kebab case.
- simplified WpmGauge stroke (was an unreachable branch), MicIndicator (dead variant/bars props), AppGrid (unused variants), button destructive-outline (token utilities).

### Learnings
- a ready/shutdown handshake must break the worker loop, not no op. paste.rs and audio.rs both had loop-forever-on-shutdown bugs from the same blind spot.
- check then act on shared mutex state (is_active then begin) is a race even without an await between them, because tauri async commands run in parallel on the tokio pool.
- huggingface serves the authoritative git lfs sha256 at /raw/<file> (the pointer) without downloading the file, so model digests can be pinned cheaply.

## 2026-06-10: mockup/insights-brutalist - indicator pill stuck on screen (tao visibility flag desync)

### Problem
After the capture handshake fix, dictation worked but the mic pill never dismissed. Every `hide_indicator` call silently did nothing.

### Root cause
The show path bypasses tauri on windows (raw `SetWindowPos(SWP_SHOWWINDOW | SWP_NOACTIVATE)` so the pill never steals foreground), but the hide path still used `win.hide()`. tao tracks window visibility in an internal flags state and `set_visible` only applies the diff between old and new flags. since the window was shown behind tao's back, tao still believed it was hidden, so `win.hide()` diffed hidden to hidden and no oped. the pill stayed visible forever after the first show.

### Fix
`pipeline.rs`: `hide_indicator` now mirrors the show path with a raw `SetWindowPos(SWP_HIDEWINDOW | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE)` on windows, falling back to `win.hide()` only if the raw call fails.

### Learnings
- if you manipulate a tao or tauri window through raw win32 calls, every state change for that property must go raw. mixing raw show with tao hide (or vice versa) desyncs tao's cached window flags and the tao call becomes a silent no op.

## 2026-06-10: mockup/insights-brutalist - capture worker ready handshake deadlocked the hotkey

### Problem
Pressing the hotkey logged `on_hotkey_press: enter` and then nothing. The mic indicator never appeared and the queued release event was never processed, so the hotkey looked dead. Earlier this surfaced as `hotkey channel full, dropping event` (the dispatcher was wedged, so the bounded channel filled); switching to an unbounded crossbeam channel removed the drops but the dispatcher still hung.

### Root cause
Commit 7c29765 rebuilt `CaptureWorker` around a ready handshake: `CaptureWorker::start` blocks on `ready_rx.recv()` until the worker confirms the wasapi stream is live. But the worker thread only sent on `ready_tx` after `run_worker` returned, and `run_worker` contains the command loop that runs until shutdown. On the happy path the ready signal was never sent, so the first `ensure_capture` after launch blocked forever inside `on_hotkey_press`, holding the capture mutex and freezing the single hotkey dispatcher thread.

### Fix
`run_worker` now takes the ready sender and signals `Ok(())` immediately after `stream.play()` succeeds, before entering the command loop. Init errors still propagate: the spawn closure forwards any early `Err` from `run_worker` to the waiting caller.

### Learnings
- a ready handshake must be signaled from inside the worker before its main loop, not from the spawn wrapper after the worker function returns. if the worker function loops forever, the wrapper send is dead code on the success path.
- when a bounded channel reports full, treat it as a consumer stall symptom first. the fix is finding what blocked the consumer, not resizing the channel.

### What
Benchmarked the Parakeet-TDT-0.6B-v3 model on a 150 utterance subset of LibriSpeech test-clean, comparing the int8 build we ship against fp32. Harness lives in `bench/` and uses the `sherpa-onnx` python package (same c++ core as the rust `sherpa-rs` crate, so accuracy matches the app). Full report in `BENCHMARK.md`.

### Results
- int8: WER 1.69%, CER 0.64%, RTF 0.036 (27x realtime), model RAM 723 MB, peak 2.17 GB.
- fp32: WER 1.44%, CER 0.47%, RTF 0.08 (12.5x realtime), model RAM 2.29 GB, peak 3.88 GB.
- Published NVIDIA reference is 1.93% on full test-clean, so the setup is correct (the subset runs a touch lower).

### Learnings
- int8 costs about 0.25 points of absolute WER versus fp32 (1.69 vs 1.44) but is 2.2x faster and uses about a third of the model memory. int8 is the right default for a realtime dictation app; fp32 is the max quality option for users with RAM to spare. This is the data behind the planned settings option (let users pick int8 vs fp32, showing memory and quality).
- Supply chain: all python deps are pinned to vetted mature versions in `bench/requirements.txt`, installed as wheels only with no source builds. Models and dataset come from the legitimate `csukuangfj` / k2-fsa HuggingFace repos. The dataset loads from the parquet convert branch with audio decoding disabled (soundfile reads the flac bytes), so no remote loader script runs and no torch dependency is pulled.

## 2026-05-24: main - voice capture quality (gain normalization, speak now cue, zero default pre roll)

### Problem
- Transcription was flaky on quiet speech and the first word often dropped. There was no gain control anywhere in the pipeline. Raw samples went straight to the 80 dim log mel features (`transcribe.rs`), so low volume input reached the model weak and sometimes came back empty.
- The recording pill only showed a running timer, not a clear cue for when to start talking. The 450 ms pre roll was meant to cover the gap, but quiet first words were still lost (a model sensitivity issue, not clipped audio).

### Fix
- `audio.rs`: added `normalize_peak`, a peak normalization pass in `stop_recording`. It boosts quiet recordings toward a 0.95 peak, only boosts (never attenuates, so healthy recordings are untouched), skips near silence (peak below 0.01) so it does not amplify background noise, and caps gain at 12x so a faint clip is not blown up. Applied after resample, before transcription.
- `settings.rs`: `default_preroll_ms` is now 0 (zero buffer). Capture is always live so recording starts the instant the key goes down.
- `MicIndicator.tsx`: added `useSpeechDetected`, which polls the rms meter and flips once your voice crosses 0.02. The pill shows a "Speak now" cue until then, then reveals the live waveform and timer.

### Learnings
- There is no VAD or loudness gate in the pipeline. The only short circuit is `MIN_RECORDING_SEC` (0.30) in `pipeline.rs`, a wall clock hold floor for fat finger taps. The flakiness was gain plus the empty result path, not a threshold rejecting quiet input.
- The model is int8 quantized (`model_download.rs` pulls the int8 onnx assets). int8 plus low SNR compounds the quiet speech problem, which is why normalization helps. An int8 vs fp32 benchmark is the next step.
- `normalize_peak` only changes the audio sent to the model. The live rms meter is computed on raw stream samples in `process_samples`, so the "Speak now" threshold reflects true input, not normalized audio.

## 2026-05-21: feature/mumble-backend - UI redesign (top-tab shell, soft-lift depth, app icons)

### Decisions
- Dropped the sidebar in favor of a segmented top-tab pill (History/Insights). Settings now opens via a gear icon in the tab bar. Reason: a 220px sidebar with two nav items read as empty on wide displays.
- History contained at 640px (reading column), Insights at 880px (dashboard). Width follows the view's job, not the shell.
- Inline card expand replaced the Sheet drawer for transcript detail. A drawer for a two-second "Hi what's up" was overkill.
- Tinted canvas (`--background: 40 14% 95.5%`) plus layered card shadows (`.shadow-lift`, `.shadow-lift-hover`) fixes the flat look. Pure white on pure white had nothing to elevate.
- Logo ships as two SVGs (`src/assets/logo-light.svg`, `logo-dark.svg`) imported as React components via `vite-plugin-svgr`. Theme-aware `<Logo>` swaps by `useTheme().resolvedTheme`. The current art is a hand-drawn creature, needs a simplified small-size variant for tab/favicon/tray (parked).
- `theme-provider.tsx` now tracks system theme via a `MediaQueryList` listener so `resolvedTheme` updates when the OS flips light/dark.
- App icons in History via the Windows Shell API. Implementer dropped the `systemicons` crate (it links gtk-3 on Linux and conflicted with `rfd`/`tauri-plugin-dialog`); replaced with direct `windows` crate calls (`SHGetFileInfoW` + `GetIconInfo` + `GetDIBits`) and a hand-rolled PNG encoder via `miniz_oxide`. Cache lives in `SharedState.icon_cache` (`Mutex<HashMap<exe_path, Option<data_url>>>`) — extract once per path, success or failure both cached.
- Window controls (min/max/close) were broken because the Tauri capabilities were missing the `allow-minimize`/`allow-maximize`/`allow-unmaximize`/`allow-toggle-maximize`/`allow-is-maximized` permissions. The titlebar JS code was already wired; just the capabilities file blocked IPC.

### Built (commits, in order)
- `ab6b3d2` chore: add vite-plugin-svgr for inline svg components
- `a3da058` feat: add mumble logo svgs
- `9f5c8b2` feat: add Logo component with theme-aware swap
- `1fb4e79` feat: soft-lift design tokens, tinted canvas and layered shadows
- `f48e1f8` feat: segmented tab bar with logo, theme toggle, settings gear
- `2215b0d` fix: add aria-pressed to tab bar buttons
- `be358e0` feat: switch main shell to top-tab layout
- `a397f37` fix: wire titlebar window controls to tauri api
- `b3e5d5a` feat: group transcripts by Today/Yesterday/Earlier
- `df8de8c` feat: TranscriptCard with inline expand and edit
- `f5658db` refactor: history view contained column with grouped expandable cards
- `03c5e94` feat: contain insights view to 880px column
- `4b86683` feat: app icon extraction with in-memory cache
- `9698ffe` feat: get_app_icon tauri command
- `d4833a4` feat: getAppIcon wrapper and store cache
- `b9ae7d4` feat: AppIcon with monogram fallback
- `b0e2b7c` feat: show app icon next to app name in history cards

### Known followups (NOT done in this redesign)
- TranscriptCard `Edit` button saves edits to local card state only. No `update_transcript` backend command yet, so edits don't persist across reloads. Wire it when the dictionary feature lands (the edit-diff is what feeds the auto-add loop).
- `target_app.rs` strips the directory before storing (`notepad.exe`, not `C:\Windows\System32\notepad.exe`). Real app-icon extraction needs the full path, so right now every History card shows the monogram fallback. To enable real icons: store `target_app_path` on `transcripts`, surface it as `targetAppPath` on `Transcript`, pass it to `<AppIcon exePath={...}>`. One backend migration plus a one-line frontend change.
- Logo simplified small-size mark (head only, chunkier strokes) for taskbar/tray/favicon. The full creature muddies under ~32px.

### Out of scope (separate plans)
- Dictionary feature (edit-diff auto-add, replacement table, find/replace at paste time).
- LLM formatting pass (Qwen2.5-1.5B via llama-cpp-2 Vulkan).
- Mac/Linux app icon extraction (Windows-only for now).

---

## 2026-05-01: feature/mumble-backend - frontend rewrite to Claude Design system

### Changes
Tore down the warm-cream variant (`hsl(40 30% 98.5%)` background, emerald `--brand`, Inter + JetBrains Mono fonts, `--radius: 10px`) and replaced with the Claude Design output: shadcn neutral tokens (`hsl(0 0% 100%)` light, full inverse dark), Geist Sans only (`--font-mono: var(--font-sans)` so existing `font-mono` classes still render Geist), `--radius: 0.5rem`, no chromatic accent, sidebar kept warm cream (`hsl(48 33% 97%)`) as the one explicit override of the no-warm-tints rule.

Files rewritten: `src/index.css`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/sidebar.tsx`, `src/components/theme-toggle.tsx`, `src/features/history/HistoryView.tsx`, `src/features/settings/SettingsView.tsx`, `src/App.tsx`, `index.html` (title fix). New: `src/components/app-header.tsx`. Bundled: `public/fonts/Geist-Variable.woff2`. Installed: `@/components/ui/dropdown-menu` (for the new 3-way theme toggle).

### Lucide-react: bumped 1.8.0 → 1.14.0; no Github icon
The repo had `lucide-react@^1.8.0` which is from 2022 and missing many icons. Bumped to 1.14.0 for full coverage. Lucide 1.x dropped brand icons (presumably licensing) — `Github` is no longer exported. Swapped to `ExternalLink` for the "View on GitHub" link in Settings → About. Honest semantically (clicking it opens an external page) and matches the design's "lucide-only" rule.

### Removed: brand variant from Button + Badge
Design has no chromatic accent — `--brand` token deleted. `buttonVariants.brand` and `badgeVariants.brand` were the only consumers; removed. `link` button variant changed from `text-brand` → `text-foreground`.

### Refactored: react-hooks/exhaustive-deps suppression
Old `HistoryView.tsx` had `// eslint-disable-next-line react-hooks/exhaustive-deps` on the search debounce effect because `refresh()` closed over `query` + `setTranscripts`. Inlined the fetch logic into the effect so the dep array reflects exactly what's used; suppression removed.

### Learning
When you tear down a feature flag / theme variant, also audit `cva` variants and shadcn primitives that referenced the dropped tokens. `Button.brand` and `Badge.brand` were leftover landmines that would still compile and silently break any caller still passing `variant="brand"`. Compile/typecheck doesn't catch dead variants.

---

## 2026-05-01: feature/mumble-backend - sherpa-onnx CMake configure fails on Windows 11 24H2+

### Problem
`pnpm tauri dev` on Windows 11 build 26200 (24H2) failed during the sherpa-rs-sys CMake configure step:

```
-- OS used to build sherpa-onnx: NOTFOUND
CMake Error at cmake/show-info.cmake:66 (string):
    string sub-command REPLACE requires at least four arguments.
```

### Root cause
sherpa-onnx (via sherpa-rs-sys 0.6.8) uses `wmic os get caption,version` to detect the Windows version inside `cmake/show-info.cmake`. Microsoft removed `wmic.exe` from Windows 11 24H2 onwards, so the command runs but returns nothing. CMake 4.3 then trips on `string(REPLACE "\n" ";" var ${empty})` because `${empty}` expands to zero arguments and `string(REPLACE)` requires at least four. CMake 3.x was lenient about this; 4.x is strict.

### Fix (temporary)
Patched `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/sherpa-rs-sys-0.6.8/sherpa-onnx/cmake/show-info.cmake` lines 57-70:
- Added `ERROR_QUIET` to the wmic execute_process so the missing binary does not surface
- Wrapped the `string(REPLACE)` call in `if(SHERPA_ONNX_OS_TWO_LINES)` to skip it when the var is empty
- Quoted `"${SHERPA_ONNX_OS_TWO_LINES}"` so even non-empty values pass as a single argument
- Added an `else` branch that sets `SHERPA_ONNX_OS` to `"Windows ${CMAKE_SYSTEM_VERSION}"` as a fallback

### Caveat
This patch lives in the cargo registry cache. It survives `cargo clean -p sherpa-rs-sys` but will be wiped silently on `cargo update` of sherpa-rs or any global cargo cache invalidation. Long-term fix: fork sherpa-rs-sys, commit the patch, and use `[patch.crates-io]` in `src-tauri/Cargo.toml` to pin to the fork. File an upstream PR against `k2-fsa/sherpa-onnx` while you are at it.

### Learning
Be wary of any C++ build script that shells out to OS-specific tools for cosmetic reasons (banner strings, version reporting). They tend to bit-rot fastest because they are not on the critical path and nobody notices when they break in a new Windows release.
