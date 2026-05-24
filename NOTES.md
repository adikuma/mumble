# Mumble Notes

Continual log of bug fixes, design decisions, and learnings. Newest entries on top.

---

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
