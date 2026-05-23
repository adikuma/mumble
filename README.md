# Mumble

A Hex-style push-to-talk voice dictation app for Windows. Hold a hotkey, speak, release, and the transcript pastes into whatever app is focused. Fully on-device — your audio never leaves the machine.

Written in Rust (Tauri backend) + React (webview UI). ASR runs through [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) on [Parakeet-TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).

> **Status:** milestone 2 — full backend landed. Hotkey listener, WASAPI capture with pre-roll ring buffer, Parakeet-TDT transcription, clipboard-safe paste, SQLite history, system tray, floating mic indicator, settings persistence, model auto-download. Requires Windows to run end-to-end.

## Stack

- **Backend:** Rust, Tauri 2, cpal (WASAPI), rdev (low-level keyboard hook), sherpa-onnx, arboard, enigo, rusqlite, tokio.
- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui-style primitives, Radix primitives, Framer Motion, Zustand, Sonner, Lucide icons.

## Dev

```bash
pnpm install
pnpm dev            # Vite-only (UI work, any OS)
pnpm tauri dev      # full app — requires Windows or WebKitGTK on Linux
```

## Quality gates (run before every commit)

```bash
pnpm format:check   # Prettier
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm build          # Vite production build
# When on Windows:
pnpm tauri build    # full NSIS installer
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

## Screenshots

Latest UI screenshots live under `docs/screenshots/mN-<slug>/`. Regenerate via:

```bash
pnpm dev &
node scripts/screenshots.mjs
```

(Uses Playwright against the Vite dev server. Tauri-native surfaces — tray, floating indicator, acrylic — must be captured on Windows once wired up.)

## Repo layout

```
src/                     React frontend
  components/ui/         shadcn-style primitives (button, card, dialog, …)
  features/
    history/             History view (SQLite-backed, live search)
    settings/            Settings (hotkey rebind, device picker, startup, model)
    indicator/           Floating mic indicator (standalone window)
  lib/tauri.ts           Typed IPC wrappers (invoke + listen)
  lib/useBackendBridge   Event → Zustand bridge
  store.ts               Zustand global state
src-tauri/src/
  state.rs               Lock-free AppState (Idle/Recording/Transcribing/Pasting)
  settings.rs            JSON persistence in %APPDATA%\Mumble
  history.rs             SQLite schema + CRUD
  paths.rs               OS paths (data dir, models dir)
  audio.rs               cpal WASAPI capture + 1 s ring buffer + resample
  hotkey.rs              rdev global listener (press/release, rebindable)
  paste.rs               arboard snapshot + enigo Ctrl+V + restore
  transcribe.rs          sherpa-onnx Parakeet-TDT (mock on non-Windows)
  model_download.rs      First-run asset download with progress events
  pipeline.rs            Hotkey → record → transcribe → paste state machine
  tray.rs                System tray icon + menu
  commands.rs            #[tauri::command] handlers (IPC surface)
  lib.rs                 Setup: plugins, managed state, tray, hotkey listener
docs/
  e2e/                   Per-milestone manual test checklists
  screenshots/           Per-milestone UI screenshots
scripts/screenshots.mjs  Playwright capture script
```

See `/root/.claude/plans/what-is-this-project-playful-cake.md` for the full architecture plan.
