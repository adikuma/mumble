# Mumble

A Hex-style push-to-talk voice dictation app for Windows. Hold a hotkey, speak, release, and the transcript pastes into whatever app is focused. Fully on-device — your audio never leaves the machine.

Written in Rust (Tauri backend) + React (webview UI). ASR runs through [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) on [Parakeet-TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).

> **Status:** milestone 2 — full backend landed. Hotkey listener, WASAPI capture with pre-roll ring buffer, Parakeet-TDT transcription, clipboard-safe paste, SQLite history, system tray, floating mic indicator, settings persistence, model auto-download. Requires Windows to run end-to-end.

## Stack

- **Backend:** Rust, Tauri 2, cpal (WASAPI), rdev (low-level keyboard hook), sherpa-onnx, arboard, enigo, rusqlite, tokio.
- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui-style primitives, Radix primitives, Framer Motion, Zustand, Sonner, Lucide icons.

## Prerequisites

- **Rust toolchain** installed via [`rustup`](https://rustup.rs/) (stable channel).
- **Visual Studio Build Tools 2022** with the "Desktop development with C++" workload (MSVC toolchain). Required by the Tauri build and by sherpa-onnx's native libs.
- **CMake** (`winget install Kitware.CMake` is fine). sherpa-onnx's C++ deps invoke CMake during the first `cargo build`.
- **WebView2 runtime** — preinstalled on Windows 11.
- **Node.js 20 or newer** and [`pnpm`](https://pnpm.io/) (`corepack enable` is the easiest path).

## First run

The first time you launch Mumble it downloads the int8 Parakeet model (about 670 MB) from `huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` into `%LOCALAPPDATA%\Mumble\models\`. Subsequent launches are fully offline.

## Dev

```bash
pnpm install
pnpm dev            # Vite-only (UI work, any OS)
pnpm tauri dev      # full app — requires Windows
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

## Known build issues

### sherpa-rs `wmic` failure on Windows 11 24H2+

Recent Windows 11 builds (24H2 and later) removed the deprecated `wmic` CLI tool. `sherpa-rs-sys` 0.6.x's CMake script calls `wmic` during configuration to detect CPU info, so a fresh `cargo build` fails with an unhelpful CMake error.

Workaround until upstream pins land: open the cached source for `sherpa-rs-sys` in your Cargo registry (under `~/.cargo/registry/src/.../sherpa-rs-sys-0.6.*/sherpa-onnx/cmake/show-info.cmake`) and replace the `execute_process(COMMAND wmic ...)` block with a no-op or with a `cmake_host_system_information` query. The Mumble `NOTES.md` log under `2026-05 — build gotcha: sherpa-onnx wmic failure` contains a worked example.

## Screenshots

Latest UI screenshots live under `docs/screenshots/mN-<slug>/`. Regenerate via:

```bash
pnpm dev &
node scripts/screenshots.mjs
```

(Uses Playwright against the Vite dev server. Tauri-native surfaces — tray, floating indicator, acrylic — must be captured on Windows once wired up.)

## Architecture

Mumble has two Rust threads of control: a global hotkey listener and the Tauri main loop. On press, the pipeline starts WASAPI capture into a ring buffer; on release, it drains the buffer, hands it to sherpa-onnx, snapshots the clipboard, synthesizes `Ctrl+V`, and restores the prior clipboard contents. State transitions are gated by a single atomic `AppState`.

For a detailed walk through the state machine, the IPC surface (`#[tauri::command]` handlers and `mumble://*` events), the on-disk data directories, and the end-to-end paste sequence, see [`docs/architecture.md`](docs/architecture.md).
