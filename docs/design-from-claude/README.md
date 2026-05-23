# Mumble Design System

A design system for **Mumble**, a Windows desktop push-to-talk voice dictation app. The user holds a global hotkey, speaks, releases — the transcript pastes into whatever app has focus. All transcription runs on-device. The app is invisible 99% of the time and lives in the system tray.

The system itself is small on purpose: Mumble is a system utility, not a product. Treat every pixel like Apple's System Settings — if it isn't earning its keep, drop it.

---

## Sources

This design system was derived directly from:

- **GitHub** — [`adikuma/mumble@feature/mumble-backend`](https://github.com/adikuma/mumble/tree/feature/mumble-backend)
  - `src/index.css` — shadcn neutral/zinc tokens, `--radius: 0.5rem`
  - `src/components/ui/{button,card,badge,input,switch,separator,dialog}.tsx` — shadcn New York primitives
  - `src/components/sidebar.tsx`, `theme-provider.tsx`, `theme-toggle.tsx`
  - `src/features/history/HistoryView.tsx` + `sample-data.ts`
  - `src/features/settings/SettingsView.tsx`
  - `src/features/indicator/{IndicatorWindow,MicIndicator}.tsx`
  - `components.json` (shadcn config: `style: new-york`, `baseColor: stone`, `iconLibrary: lucide`)
- **UI brief** — pasted by the user; supersedes the codebase on three points:
  1. **Font** — brief mandates `Geist Sans only`. The repo currently has `Inter` + `JetBrains Mono` in `index.css`. We follow the brief.
  2. **No mono** — timers, durations and shortcuts render in regular Geist with `tabular-nums`.
  3. **No warm tints, glassmorphism beyond optional indicator acrylic, gradients, glows, mascots, or marketing flourishes.**

The on-device ASR model is **Parakeet-TDT v3** via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). The frontend talks to the Rust/Tauri backend over the IPC commands and `mumble://*` events documented in the brief.

## Index

- [`colors_and_type.css`](./colors_and_type.css) — every CSS variable, in light + dark
- [`fonts/`](./fonts/) — Geist Variable woff2
- [`assets/`](./assets/) — logomark, wordmark, 16×16 tray icon
- [`preview/`](./preview/) — design-system cards (rendered into the Design System tab)
- [`ui_kits/desktop-app/`](./ui_kits/desktop-app/) — main window: sidebar + History + Settings, click-thru
- [`ui_kits/mic-indicator/`](./ui_kits/mic-indicator/) — floating pill window + tray
- [`SKILL.md`](./SKILL.md) — Agent Skill manifest

---

## Content fundamentals

**Voice: a calm system utility.** Mumble talks like a settings page, not a product. No "welcome aboard," no exclamation points, no second-person hand-holding, no marketing energy.

**Casing.** Sentence case for everything — labels, buttons, cards, dialogs. Title case is reserved for proper nouns (`Right Ctrl`, `Parakeet-TDT v3`, `Windows`, `GitHub`). Section headings stay lowercase-feeling: `Hotkey`, `Audio`, `Startup`, `Model`, `About` — single nouns, no decoration.

**Person.**
- Toasts and confirmations: imperative or third-person describing the action — `"Copied to clipboard"`, `"Pasted to last app"`, `"History cleared"`, `"Hotkey saved"`. Never `"You copied…"`, never `"We've copied…"`.
- Empty states + dialog descriptions: lightly second-person where it helps the user *do* something — `"Hold your hotkey anywhere to dictate."`, `"Choose which microphone Mumble listens to."`, `"Your audio never leaves this machine."`.
- Background facts: third-person, no subject — `"Local on-device transcription."`

**Length.** Short. CardTitle is one word when possible. CardDescription is one sentence, ≤14 words. Toast strings are ≤4 words. Empty-state body never exceeds two short sentences.

**Tone of confirmation.** Action verbs in past tense, no exclamation: `Copied`, `Deleted`, `Hotkey saved`, `Model downloaded`. Errors begin with the action that failed and a colon: `"Copy failed: <reason>"`, `"Capture failed: <reason>"`.

**Numbers.** Always tabular. Durations as `m:ss` (`0:03`, `1:42`). Sizes as `423 MB / 612 MB`. Relative time clamps at `Yesterday` then switches to `N days ago`.

**Hotkey labels.** Render the binding inside an outline `Badge`, with directional modifiers space-split — `Right Ctrl`, not `RightCtrl`. In capture mode the same chip says `Press any key…` (note ellipsis, not three dots).

**Privacy reassurance.** Explicit, single sentence, only where relevant — confirmation dialogs and the Model card both say it: `"Nothing leaves your machine — it's a local delete."`, `"Your audio never leaves this machine."` Don't repeat it elsewhere.

**Forbidden.** Emoji. Mascot voice. Onboarding language. Gradients in copy ("seamlessly", "magically"). Product-market-y verbs ("supercharge", "delight", "unlock"). The word "experience".

### Copy specimens (verbatim from `src/features/`)

> **Settings → Hotkey description:** "Hold anywhere on your system to record, release to transcribe."
> **Settings → Audio description:** "Choose which microphone Mumble listens to."
> **Settings → Model description:** "Local on-device transcription. Your audio never leaves this machine."
> **History → empty state:** "No transcripts yet" / "Hold your hotkey anywhere to dictate."
> **History → empty state (with query):** "No matches" / "Try a different search query."
> **Clear-all dialog:** "Clear all history?" / "This deletes every transcript permanently. Nothing leaves your machine — it's a local delete."
> **Toasts:** Copied to clipboard · Pasted to last app · History cleared · Hotkey bound to Right Ctrl · Model re-downloaded · Deleted

---

## Visual foundations

**Mood.** Linear-restraint. Closer to System Settings than to Notion. Compact-comfortable density. Surfaces are flat; depth is implied through 1 px borders and a single soft shadow on dialogs only.

**Color.** Monochrome with one accent — and the accent **is** the foreground in shadcn neutral, so practically there is no chromatic accent at all. The brand expresses itself as steady neutral grays + the destructive red used only for `Delete` / `Clear all`. Specifically:

- Light: `--background: 0 0% 100%`, `--foreground: 240 10% 3.9%`, `--primary: 240 5.9% 10%`. Sidebar shifts one tick to `0 0% 98%` so the rail reads as a separate plane.
- Dark: inverted — background `240 10% 3.9%`, foreground `0 0% 98%`. The dark sidebar is `240 5.9% 10%` (same shade as primary in light) so it sits "in front" of the canvas.
- Destructive: `0 84.2% 60.2%` (light) / `0 62.8% 30.6%` (dark). Used **only** on confirm-destructive buttons and the empty-state Trash icon hover. Never decorative.
- Recording dot in the indicator inherits `--foreground` (which is white-ish in dark, near-black in light); pulses at 1 Hz. There is no brand emerald, no custom hue, no warm cream.

**Type.** Geist Sans, full variable axis. Default weight 400, 500 for buttons/labels, 600 for headings and `CardTitle`. No second display face, no mono. Numerals always tabular when they sit in a vertical or horizontal column. Letter-spacing tightens by `-0.01em` at 18 px+ headings.

Type sizes are tiny by web standards because Mumble lives at desktop pixel ratios:
- 11 px — meta, footer chips, version stamp
- 13 px — body default, list rows, settings labels (`text-sm`)
- 15 px — transcript detail body
- 18 px — `Settings` page heading

**Spacing.** Tailwind-default 4 px scale. Cards: 16 px outer padding (`p-4`). Header strip is exactly 48 px tall (`h-12`), buttons are 36 px tall (`h-9`), inputs and selects are 36 px, switches are 20 px tall × 36 px wide. Sidebar widths are exactly **240 px expanded → 56 px collapsed** (Tailwind `w-60` and `w-14` — note: 14·4 = 56 px, matching the brief). Dialogs cap at `max-w-md` (≈ 448 px).

**Backgrounds.**
- Main window canvas: solid `--background`, no images, no patterns, no gradients, no noise.
- Indicator window: solid `--card`. If Win11 `acrylic` is available the borderless window applies it system-side; the React surface stays solid. Never CSS `backdrop-filter` for theming.
- No hero imagery anywhere. No full-bleed photography. No illustration.

**Borders.** Uniformly 1 px, color from `--border` (light: `240 5.9% 90%`, dark: `240 3.7% 15.9%`). Cards, inputs, separators, sidebar rail — all the same. The selected History row gets a 2 px **left** accent border in `--foreground`; this is the only place we double-up border weight.

**Radii.** From `--radius: 0.5rem` (8 px). Buttons, inputs, badges, cards all use `rounded-md` (6 px) or `rounded-lg` (8 px). Indicator pill is `rounded-full`. Switches are `rounded-full`. Avatars / circle icon backings are `rounded-full`. **No half-radius, no pill-shaped buttons** outside the indicator.

**Shadows.**
- `shadow-sm` on inputs and switches — a hairline (≈ rgba 0,0,0, 0.05). That's it.
- `shadow-lg` on the dialog only.
- The indicator pill is shadow-less (the borderless window itself drops a system shadow on Windows).

**Motion.** Conservative.
- 150–200 ms `transition-colors` on hover/active state changes (buttons, list rows, sidebar items, switch).
- 200 ms width transition on the sidebar collapse.
- 220 ms ease-out scale 0.95 → 1 + opacity on the indicator mount; 180 ms opacity + +8 px translate on unmount. **Only the indicator window animates entry/exit.**
- Recording dot: 1 Hz opacity pulse (1.0 → 0.4 → 1.0), CSS keyframes.
- Waveform bars: 75 ms `transition-[height]` so the meter tracks RMS smoothly at ~22 Hz.
- View transitions (History ↔ Settings) cross-fade 160 ms — no x or y slide.
- `prefers-reduced-motion: reduce` zeroes all of the above except the waveform sample updates (which still happen, just without smoothing).

**Hover states.** `hover:bg-accent` (which is `--muted` — one step darker / lighter than the surface). Ghost buttons reveal a 36 × 36 hit target. Sidebar nav items use `hover:bg-sidebar-accent` (same value as accent in this neutral theme).

**Press / active states.** No scale. No shrink. shadcn primaries dim with `hover:bg-primary/90`; secondaries with `hover:bg-secondary/80`; destructive with `hover:bg-destructive/90`. Selected History row uses `bg-muted/60` + 2 px left border.

**Focus states.** `ring-2 ring-ring ring-offset-1 ring-offset-background` on every interactive primitive — uniform across button, input, switch, dialog close. Outline is removed in favor of the ring.

**Transparency / blur.** Almost never. The indicator card is solid; only the borderless OS window may be acrylic (system-level, not CSS). No glassmorphism in the main window. The dialog overlay is `bg-black/50`, no blur.

**Layout rules.**
- Main window canvas fills viewport (`h-screen w-screen overflow-hidden`).
- Sidebar is fixed-width column, header is sticky 48 px tall, content area fills remainder.
- Settings content is a single 640 px-max column centered on the canvas.
- History below 900 px collapses to list-only; selecting a row opens the detail in a `Sheet` from the right.

**Imagery & illustration.** None. There are no product photos, no brand illustrations, no decorative icons. The only graphics in the system are the **Mumble mark** (a 24-grid Lucide-style mic glyph), the wordmark, and the 16 × 16 tray icon.

---

## Iconography

**Library: `lucide-react` only.** Every icon in the product comes from Lucide. No hand-rolled SVG, no icon font, no Material/Heroicons mix-ins, no emoji as iconography, no Unicode glyph substitutes. The brief is explicit on this and the codebase confirms it: imports across `sidebar.tsx`, `HistoryView.tsx`, `SettingsView.tsx`, `theme-toggle.tsx` resolve to `lucide-react`.

**Stroke / size.** Lucide defaults. Stroke width 2, square caps, round joins. The shadcn Button component sets `[&_svg]:size-4`, so any icon inside a button auto-resizes to 16 × 16. Free-standing icons: 16 px in rows, 20 px in card headers, 32 px in empty-state circles.

**Color.** Icons inherit `currentColor`. Active states: `text-foreground`. Idle/secondary: `text-muted-foreground`. Destructive icons (`Trash2` in confirm, never elsewhere) keep `currentColor` and rely on the surrounding button variant to color them.

**Catalog (used in the live product, by surface):**
- Sidebar: `History`, `Settings`, `Mic`
- History view: `Search`, `Trash2`, `Copy`, `CornerDownLeft` (paste-again), `MicOff` (empty)
- Settings view: `Keyboard`, `Mic`, `Power`, `Cpu`, `Info`, `Download`, `Github`
- Theme toggle: `Sun`, `Moon`, `Monitor`
- Tray menu: `AppWindow`, `Pause`, `Play`, `LogOut`, `Settings`
- Dialog: `X` (close)

**CDN.** When using this design system in a static HTML artifact, load Lucide from CDN: `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js` and call `lucide.createIcons()` after mount, or render JSX components directly via `https://esm.sh/lucide-react@0.473.0`. The repo uses `lucide-react@^1.8.0` — pin to the latest 0.x for the broadest icon set.

**Brand mark.** A simplified Lucide-`Mic`-shaped logomark sits in `assets/mumble-mark.svg` (24 grid) and `assets/mumble-wordmark.svg` (Mark + "Mumble" set in Geist 18/600). The 16 × 16 tray glyph (`assets/mumble-tray-16.svg`) is a lighter-stroke version intended to auto-theme against the Windows tray background — same shape, 1.4 px stroke, no fill.

**Emoji.** Never. Not in copy, not as iconography, not as fallback.
