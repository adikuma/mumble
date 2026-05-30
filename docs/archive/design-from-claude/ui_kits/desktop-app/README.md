# Mumble — Desktop App UI Kit

Pixel recreation of the Mumble main window (`960 × 640` default, `720 × 480` min) — sidebar + sticky header + History or Settings view. Mirrors the actual code on `feature/mumble-backend`:

- `src/components/sidebar.tsx` — collapsible 240 → 56 sidebar
- `src/components/theme-toggle.tsx` — Sun/Moon icon-only toggle (the real app has a 3-way; we keep that 3-way menu here for fidelity to the brief)
- `src/features/history/HistoryView.tsx` — search + virtualizable list (we render ~10 rows live)
- `src/features/settings/SettingsView.tsx` — five cards (Hotkey, Audio, Startup, Model, About)
- `src/components/ui/{button,card,badge,input,switch,separator,dialog}.tsx`

## Files

- `index.html` — shell + click-thru demo. Loads Geist + Lucide from CDN, wires React + Babel.
- `Primitives.jsx` — `Button`, `Badge`, `Input`, `Switch`, `Separator`, `Card*`, `Dialog`, `Icon` (Lucide wrapper).
- `Sidebar.jsx` — collapsible sidebar with `Mic` mark + nav + footer hotkey badge.
- `Header.jsx` — sticky 48 px strip with breadcrumb + 3-way theme toggle.
- `HistoryView.jsx` — search, list + detail two-pane (collapses below 900 px), confirm-clear dialog.
- `SettingsView.jsx` — five settings cards.

## Demo behavior

- Click a History row → detail updates (no animation).
- Click `Trash2` in row hover → row deletes.
- Top-bar `Trash2` → `Clear all history?` confirm dialog.
- Sidebar `Settings` → cross-fade to settings (160 ms opacity).
- Hotkey `Change` → captures next keypress as the new hotkey (e.g. press `F`, becomes `F`).
- Switches toggle. Theme toggle cycles light → dark → system. All persists to localStorage via `mumble-theme`.

## Things faked vs real

- The model `Re-download` button shows a fake `Progress` bar that fills in 3 s; the real backend streams `mumble://download-progress`.
- Audio level meter: 8 bars, animated with random RMS to demo the look. Real version polls `getMeter()` at ~17 Hz.
- No virtualization — we render all sample transcripts, not 10 k.
