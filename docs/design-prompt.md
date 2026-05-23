# Mumble — UI Design Brief

A self-contained design prompt for generating Mumble's frontend. Paste this into Claude design (or any LLM-driven UI tool) without additional context.

---

## What you are designing

Mumble is a Windows desktop push-to-talk dictation app. The user holds a global hotkey, speaks, releases — the transcript is pasted into whatever app has focus. All transcription runs on-device. The app is invisible 99% of the time and lives in the system tray.

Build the React + TypeScript frontend for it, using **shadcn/ui defaults** (no theming customization), **Geist** as the only font family, and **Lucide React** for every icon.

## Hard design constraints

- **Component library:** shadcn/ui. Use stock components everywhere a stock one exists. Do not modify shadcn tokens. Do not invent new variants.
- **Theme:** shadcn default light + default dark (zinc/neutral). No warm cream, no off-white tints. Whatever `pnpm dlx shadcn@latest init` ships with — that's the theme.
- **Typography:** Geist Sans only. One family, all weights from it. No mono font, no second display font. Use `geist/font/sans` (npm package).
- **Icons:** Lucide React, default stroke width, default size scale.
- **Radius:** shadcn default (`--radius: 0.5rem`).
- **Color:** monochrome with one accent — whatever shadcn's default `primary` resolves to. No brand emerald, no custom hues.
- **Motion:** 150–200 ms transitions for state changes. No bouncy entrances, no scroll-triggered animations, no glassmorphism beyond the indicator's optional acrylic.
- **Density:** compact-comfortable. Closer to Linear than Notion.

## What NOT to do

- No warm/cream backgrounds (the previous design used `hsl(40 30% 98.5%)` — discard).
- No mono fonts (no JetBrains Mono, no Geist Mono — render timers and shortcuts in regular Geist).
- No gradients, glows, mascots, hero sections, or marketing flourishes.
- No emoji.
- No custom shadcn token overrides — if you reach for `--background: ...` outside the defaults, stop.

## Three windows

### 1. Main window — `960 × 640` default, `720 × 480` min

shadcn `Sidebar` (collapsible: 240 px expanded → 56 px icon-only), header strip, content area.

**Sidebar items**
- History — Lucide `History`
- Settings — Lucide `Settings`
- Footer slot: app name + version, small

**Header (sticky)**
- Left: breadcrumb (`History` / `Settings`)
- Center (History view only): shadcn `Input` with Lucide `Search` prefix, placeholder "Search transcripts…"
- Right: theme toggle (Lucide `Sun` / `Moon` / `Monitor`, three-way: light / dark / system)

#### View A — History (default landing)

Two-pane responsive layout:
- ≥ 900 px: list 40% / detail 60% side-by-side
- < 900 px: list-only; tapping a row pushes the detail in a shadcn `Sheet` from the right

**List**
- Virtualized (use `@tanstack/react-virtual`). Plan for 10 k rows.
- Row height ~72 px.
- Row content:
  - Top: relative time ("2 min ago") + shadcn `Badge` showing duration ("3.2s")
  - Bottom: first ~90 chars of the transcript, single-line ellipsis, muted color
- Hover: reveal three Lucide icon buttons (`Copy`, `ClipboardPaste`, `Trash2`) right-aligned, ghost variant.
- Selected: `bg-accent` treatment + 2 px `primary` left border.
- Top of list: search input mirrors the header search; right-aligned `Trash2` icon button to clear all (opens shadcn `AlertDialog` with destructive confirm).

**Detail panel**
- Full transcript (selectable, max-w prose width, leading-relaxed).
- Meta footer (small, muted): recorded-at (relative + absolute on hover via `Tooltip`), duration, audio device used.
- Action row: shadcn `Button` × 3 — `Copy` (default variant), `Paste again` (secondary), `Delete` (destructive).

**Empty state**
- Centered Lucide `MicOff` icon (~32 px, muted).
- Heading "No transcripts yet"
- Sub "Hold your hotkey anywhere to dictate."
- Render the current hotkey as a kbd-styled `Badge` (e.g. `[ Right Alt ]`).

#### View B — Settings

Single column, `max-w-2xl`, stacked shadcn `Card`s. Each card has `CardHeader` (with Lucide icon + title + optional description) and `CardContent`.

1. **Hotkey** — Lucide `Keyboard`. Shows current binding as kbd-styled chip; "Change" button flips it into capture mode ("Press any key… (Esc to cancel)"). Persist on next keypress.
2. **Audio** — Lucide `Mic`. shadcn `Select` for input device (populated by backend). Below the select: a horizontal live input-level meter (animated bar widthing from 0 → 100% based on RMS).
3. **Startup** — Lucide `Power`. Two shadcn `Switch` rows: "Launch at login" and "Start minimized to tray".
4. **Model** — Lucide `Cpu`. Read-only info rows: model name "Parakeet-TDT v3 (English)", size (e.g. "612 MB"), install path (truncated-middle, copy-to-clipboard on click). Bottom: "Re-download" button (Lucide `Download` prefix). While downloading: replace with shadcn `Progress` bar + "423 MB / 612 MB" text + small `X` cancel button.
5. **About** — Lucide `Info`. App version, Tauri version, Rust version, link to GitHub repo (Lucide `Github` suffix).

### 2. Floating mic indicator — separate borderless window

`320 × 64` pill, anchored bottom-center of the active monitor (80 px from the bottom edge). Always-on-top, click-through (does not steal focus from the user's text editor).

Single shadcn `Card`-like surface. Win11 acrylic backdrop if available, else solid `card` background.

**Content, left → right (16 px horizontal padding):**
1. 8 px diameter `primary`-colored dot. **Pulses at 1 Hz** while recording, **static** while transcribing.
2. 32-bar waveform. 2 px bar width, 2 px gap. Bar heights driven by live RMS samples from the backend; smooth 60 fps. While transcribing: bars relax to a flat baseline.
3. Timer in Geist (regular, NOT mono). Format `0:03`.
4. State label, right-aligned: `Listening` → `Transcribing…`. Crossfade 150 ms on transition.

**Window motion**
- Mount: scale 0.95 → 1, opacity 0 → 1, 220 ms ease-out.
- Unmount: opacity → 0, y +8 px, 180 ms.

### 3. System tray

16×16 monochrome SVG icon, auto-themes to the Windows tray.

**State overlay dot** on the icon:
- Gray = idle
- `primary` pulsing = recording
- Animated dots = transcribing

**Left-click:** toggle main window visibility.
**Right-click menu** (Lucide icon next to each label):
- Open Mumble — `AppWindow`
- Pause / Resume — `Pause` / `Play`
- Settings — `Settings`
- Quit — `LogOut`

## Global UX behaviors

- **Theme toggle:** three-way (light / dark / system). Persist to localStorage. Apply via shadcn's standard `next-themes` provider.
- **Toasts:** sonner, bottom-right, 3 s auto-dismiss. Used for: "Copied", "Pasted to {AppName}", "History cleared", "Hotkey saved", "Model downloaded".
- **Keyboard shortcuts (in main window):**
  - `Ctrl + K` — focus search (history view)
  - `Ctrl + ,` — open Settings
  - `Ctrl + W` — hide main window to tray (do NOT quit)
  - `Esc` — close any open dialog
- **View transitions** between History and Settings: opacity fade 160 ms (no x-slide, no y-slide).
- **Reduced motion:** if `prefers-reduced-motion: reduce`, drop all non-essential transitions to 0 ms and freeze the waveform animation (still update bars but skip the smoothing).

## Tone

Calm. Fast. Invisible-by-default. Linear-restraint. The app should feel like a system utility, not a product. Treat every pixel as "would Apple ship this in System Settings?" — if no, drop it.

When the user surfaces the app (opens the main window, or sees the indicator), it should feel earned, not decorative. No "welcome aboard" energy.

## Files to generate

```
src/
  App.tsx                              # router: main vs indicator (#/indicator hash split)
  main.tsx
  index.css                            # Tailwind + shadcn default tokens, Geist setup
  store.ts                             # zustand: appState, settings, transcripts, meter, download
  lib/
    tauri.ts                           # typed invoke/listen wrappers (assume backend commands exist)
    useBackendBridge.ts                # subscribes to backend events → store
    utils.ts                           # cn, formatRelative, formatDuration
  components/
    ui/                                # shadcn-generated primitives (button, card, sidebar, sheet, dialog, alert-dialog, badge, switch, select, input, progress, tooltip, separator, scroll-area, sonner)
    theme-provider.tsx
    theme-toggle.tsx
  features/
    layout/AppSidebar.tsx
    layout/AppHeader.tsx
    history/HistoryView.tsx
    history/HistoryList.tsx
    history/HistoryListRow.tsx
    history/HistoryDetail.tsx
    history/EmptyState.tsx
    settings/SettingsView.tsx
    settings/HotkeyCard.tsx
    settings/AudioCard.tsx
    settings/StartupCard.tsx
    settings/ModelCard.tsx
    settings/AboutCard.tsx
    indicator/IndicatorWindow.tsx
    indicator/MicIndicator.tsx
    indicator/Waveform.tsx
```

Tailwind v4. shadcn/ui via `pnpm dlx shadcn@latest add <component>`. Geist via `geist` npm package (`import { GeistSans } from 'geist/font/sans'`). Lucide via `lucide-react`.

## Backend interface (do not redesign — frontend must match)

These commands and events already exist in the Rust backend. Wire to them, don't invent new ones.

**Commands (via `@tauri-apps/api/core`'s `invoke`):**
- `get_settings()` → `Settings`
- `update_settings(patch: Partial<Settings>)` → `Settings`
- `list_input_devices()` → `Array<{ id: string; name: string; isDefault: boolean }>`
- `capture_hotkey()` → `string` (blocks 30 s)
- `get_state()` → `"idle" | "recording" | "transcribing" | "pasting"`
- `get_meter()` → `number` (0–1 RMS)
- `list_history({ query?: string; limit?: number })` → `Transcript[]`
- `delete_transcript(id: string)` → `void`
- `clear_history()` → `void`
- `copy_transcript(id: string)` → `void`
- `repaste_transcript(id: string)` → `void`
- `hide_main_window()` / `show_main_window()`
- `model_status()` → `{ ready: boolean; path: string; sizeBytes: number }`
- `redownload_model()` → starts a download stream

**Events (via `listen`):**
- `mumble://state-changed` → `{ state }`
- `mumble://transcribed` → `{ transcript }`
- `mumble://error` → `{ message }`
- `mumble://ready` → `{}`
- `mumble://download-progress` → `{ bytes, total, done }`
- `mumble://settings-changed` → `Settings`

Types:
```ts
type Settings = {
  hotkey: string;
  inputDeviceId: string | null;
  launchAtLogin: boolean;
  startMinimized: boolean;
  paused: boolean;
};
type Transcript = {
  id: string;
  text: string;
  durationSec: number;
  device: string;
  recordedAt: string;  // ISO 8601
};
```

## Acceptance — when this is "done"

1. Main window opens with shadcn default theme — clean, neutral, no warm tints.
2. History view: empty state shows the current hotkey badge; populated state shows a virtualized list with hover actions; detail pane shows the selected row's transcript and metadata.
3. Settings view: five cards (Hotkey, Audio, Startup, Model, About), all interactive, all wired to the backend commands above.
4. Sidebar collapses to 56 px on narrow widths and via toggle.
5. Mic indicator: separate window, pill-shaped, bottom-center, with pulsing dot, RMS-driven waveform, timer, state label.
6. Theme toggle works three-way (light / dark / system) and persists.
7. Geist Sans is the only font face used. No mono. Verify timers and shortcuts render in regular Geist.
8. Every icon is from `lucide-react`. No SVGs hand-rolled.
9. No `framer-motion` for layout — only used for the indicator window's mount/unmount, if at all.
10. `prefers-reduced-motion` honored.
