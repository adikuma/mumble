# Milestone 1 — Scaffold screenshots

Captured from the Vite dev server (`pnpm dev` on http://localhost:1420) via Playwright on Linux. Tauri-native tray / floating indicator / acrylic blur must be re-captured on Windows once the Rust shell is wired up in milestone 2+.

| File | Theme | Viewport | Shows |
|---|---|---|---|
| `01-history-dark-wide.png` | dark | 1280×800 | History two-pane, dark (shadcn zinc) |
| `02-history-light-wide.png` | light | 1280×800 | History two-pane, light (warm cream + tan sidebar) |
| `03-settings-dark-wide.png` | dark | 1280×800 | Settings cards, dark |
| `04-settings-light-wide.png` | light | 1280×800 | Settings cards, light |
| `05-history-dark-default.png` | dark | 960×640 | History at default app window size |
| `06-history-light-default.png` | light | 960×640 | History at default app window size |
| `07-history-light-narrow.png` | light | 720×640 | Sidebar collapsed to icons, detail pane hidden (responsive) |
| `08-mic-indicator-dark.png` | dark | 1280×800 | Floating mic indicator overlay, dark |
| `09-mic-indicator-light.png` | light | 1280×800 | Floating mic indicator overlay, light |

Regenerate: `pnpm dev &` then `node scripts/screenshots.mjs`.
