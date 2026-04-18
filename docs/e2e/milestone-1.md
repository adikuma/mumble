# Milestone 1 — Scaffold: E2E checklist

Goal: a working Vite + React + Tailwind + shadcn-style shell for Mumble with the warm-cream light palette and shadcn-zinc dark palette both rendering correctly. No Rust / native behaviour yet — that starts in milestone 2.

## Quality gates

- [x] `pnpm format:check` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes (0 errors, 2 acceptable warnings on shadcn variant exports)
- [x] `pnpm build` succeeds (vite production build)
- [ ] `pnpm tauri dev` — deferred: needs webkit2gtk on Linux or WebView2 on Windows. Run on Windows in milestone 2.
- [ ] `pnpm tauri build` — deferred to Windows.

## Manual checklist (run on Linux via `pnpm dev`)

- [x] App loads at http://localhost:1420 with no console errors.
- [x] Default view is History. Sample transcripts render as list rows.
- [x] Clicking a row highlights it with a teal left-border and updates the right-hand detail pane.
- [x] Search input filters the list live.
- [x] Clicking "Settings" in the sidebar swaps the view to Settings.
- [x] Settings: Hotkey row shows `Right Ctrl`, Audio input-device shows `System Default`, Launch-at-login switch toggles, Model card shows Parakeet-TDT v3 615 MB.
- [x] Theme toggle (top right) flips between warm-cream light and shadcn-zinc dark.
- [x] In light mode the sidebar is visibly warmer/tan than the canvas (not the same shade).
- [x] In dark mode the sidebar is ~1.5% brighter than the canvas.
- [x] Resizing the window below 800 px collapses the sidebar to icon-only.
- [x] "Preview mic" button in the header shows the floating pill indicator with a pulsing teal dot and animated bars.

## Windows-only follow-ups for milestone 2+

- Tauri tray icon (left-click / right-click menu).
- Mic indicator actually positioned bottom-center of the active monitor via a separate Tauri window with `alwaysOnTop` + `ignoreCursorEvents`.
- Acrylic/Mica backdrop on the mic indicator.
- Real hotkey wiring (`rdev`).
- Real WASAPI capture + WAV write.
- Re-capture all screenshots with Win+Shift+S into `docs/screenshots/m2-*/`.
