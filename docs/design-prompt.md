# Mumble UI design brief

Use this only as a short external-design prompt. The canonical implementation guide is [`design-system.md`](./design-system.md).

## Product

Mumble is a quiet Windows desktop push-to-talk dictation app. The user holds a global hotkey, speaks, releases, and the transcript is pasted wherever they were typing. Transcription is local-first and the app should feel like a calm system utility.

## Visual Direction

- Flat, minimal desktop UI.
- Light mode uses clean white workspace, warm neutral surfaces, and amber accent.
- Dark mode uses near-black canvas, charcoal surfaces, borders for separation, and purple accent.
- Main canvas may use the subtle fading checked-line pattern defined by `.panel-bg`.
- No gradients, hero layouts, glassmorphism, bevels, decorative shadows, or marketing flourishes in the main window.

## Architecture Rules

- Use tokens from `src/index.css`.
- Use generic controls from `src/components/ui`.
- Use app primitives from `src/components/kit` and `src/components/shell`.
- Feature views should compose product structure with `Page`, `PageHeader`, `Surface`, `AppGrid`, `SettingSection`, `SettingRow`, and `SettingControl`.
- Do not introduce shadcn `Card` patterns; grouped content belongs in `Surface`.
- Use `lucide-react` icons.
- Use Geist Sans only, with tabular numerals for durations and metrics.

## App Surfaces

- Home: compact greeting, stats, grouped transcript history.
- Insights: symmetrical bento built from shared stat cards, metric strip, activity heatmap, top words, and top apps.
- Dictionary: page header, search, and a single dictionary surface.
- Settings: grouped rows inside shared settings sections.
- Indicator: separate compact window; it may keep its own physically tuned animation and meter styling.

## Acceptance

- The app fits at the configured default window size and remains usable at the minimum size.
- Sticky headers always have background and border.
- Light and dark modes both preserve contrast.
- Repeated layout, typography, controls, and surfaces come from shared primitives.
- Docs do not contradict [`design-system.md`](./design-system.md).
