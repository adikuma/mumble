# Mumble design system

Mumble is a quiet, cozy, minimal desktop dictation tool. The UI should feel calm, precise, and easy to live in every day. This document is the source of truth for frontend visual decisions.

The system is strict on purpose. New UI should use tokens and shared primitives instead of page-specific class piles.

## Visual thesis

Mumble is a flat desktop utility with warm light surfaces, minimal dark surfaces, soft borders, and one clear accent per theme.

Keep:

- clean layout with generous breathing room
- flat surfaces instead of glass, bevels, or heavy shadows
- amber accent in light mode
- purple accent in dark mode
- subtle checked line pattern inside the main panel only
- visible borders for structure
- consistent page widths and grid gaps

Avoid:

- gradients or image backgrounds in the main app shell
- random one-off Tailwind values in feature files
- nested cards
- page-specific button styles
- transparent sticky headers over scrolling content
- using accent fills for routine controls

## Layers

Frontend styling should flow through these layers:

1. Tokens in `src/index.css`
2. Generic primitives in `src/components/ui`
3. Mumble primitives in `src/components/kit` and `src/components/shell`
4. Feature components in `src/features`
5. Feature views that compose product pieces

Feature views should read like product structure. They should not define the design system.

## Tokens

Use semantic tokens first:

- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `bg-muted`, `text-muted-foreground`
- `bg-primary`, `text-primary`
- `border-border`, `border-sidebar-border`

Light mode:

- `background` is the clean workspace
- `card`, `muted`, and `sidebar` are warm neutral planes
- `primary` is amber

Dark mode:

- `background` and `sidebar` are the same quiet near-black plane
- `card` is charcoal for controls and grouped content
- `primary` is purple
- borders provide separation

Do not hardcode colors in feature files except for data visualization scales that cannot be expressed as tokens.

## Grid System

Use the app grid before inventing layout.

### Page

`Page` owns normal app page width, horizontal padding, and bottom padding.

```tsx
<Page>
  <PageHeader title="Insights" />
  ...
</Page>
```

The current desktop page max width is `980px`. Change this in `Page`, not per screen.

### PageHeader

`PageHeader` owns title, description, actions, sticky behavior, background, and divider.

Sticky headers must always have a real background and border so content can scroll underneath without visual overlap.

### AppGrid

`AppGrid` owns repeated dashboard layouts.

- `columns="stats"` for three equal stat cards
- default for two equal columns
- use `gap-4` as the base grid gap

For bento pages, build rows from these predictable blocks:

- stats row: three equal cards
- metrics strip: one full-width surface with internal columns
- activity row: one full-width surface
- detail row: two equal surfaces

Do not offset cards manually to make a grid look aligned.

## Surfaces

Use `Surface` for grouped content.

```tsx
<Surface className="p-5">...</Surface>
```

Surface owns:

- `bg-card`
- `border-border`
- app radius
- overflow behavior

Surface does not own shadows, bevels, glass, or blur.

Use page layout, typography, and data density for hierarchy before adding more chrome.

## Settings

Settings must use `SettingSection` and `SettingRow`.

```tsx
<SettingSection title="Audio">
  <SettingRow title="Microphone" desc="Microphone used during recording.">
    ...
  </SettingRow>
</SettingSection>
```

One settings section is one surface with divided rows. Do not make each row its own card.

Rows must wrap safely on narrow windows. Controls should stay visible and not force text to overflow.

## Controls

Use shared controls:

- `Button` for generic buttons
- `Switch` for binary settings
- `Select` for option sets
- `ThemeToggle` for theme selection
- `SearchBar` for page search

Control rules:

- focus states must be visible
- selected switch and theme thumbs are white
- light mode primary action uses amber sparingly
- dark mode primary action uses purple sparingly
- outline controls sit on `bg-card`, not black
- routine hover states should be subtle and clean

Icon-only actions should prefer an icon button over a text button when the action is obvious, such as adding a dictionary entry.

## Typography

Use the app type scale from `src/index.css`:

- `text-xs`: metadata and tiny controls
- `text-sm`: body UI and row text
- `text-base`: section headings inside surfaces
- `text-lg`: compact emphasis

Named app text patterns are centralized in primitives:

- page title in `PageHeader`
- section labels in `SectionLabel`
- stat values in `StatCard`
- keyboard chips in `.kbd`

Avoid repeated raw title sizes in feature views. If multiple pages need the same text pattern, move it into a primitive.

## Tailwind Scale And Raw Values

Tailwind primitives are preferred for normal layout:

- `px-4`, `py-3`
- `gap-4`
- `text-sm`
- `rounded-md`
- `size-4`

Raw values are allowed for physically specific constraints:

- the app page max width in `Page`
- fixed icon art details
- table-like column widths
- heatmap cell geometry
- the shell rail width

Raw values are not allowed for repeated product language:

- page titles
- card radius
- button height
- surface color
- section labels
- repeated accent colors

Ask: is this a measurement or a design decision? Measurements may be raw. Design decisions should be named.

## Canvas Pattern

The main panel may use a subtle token-driven checked line pattern through `.panel-bg`.

Rules:

- pattern lives only inside the main canvas
- content surfaces stay readable over it
- light mode remains clean and low contrast
- dark mode remains minimal and not noisy

No image backgrounds or gradients in the main app shell.

## Responsive Rules

Every page must fit at the app minimum window size.

- grids collapse to one column on narrow widths
- long text truncates in rows and app names
- controls remain reachable
- no fixed width may cause horizontal scrolling
- sticky headers keep their background and divider

## Review Checklist

Before accepting frontend changes:

- Does it use `Page`, `PageHeader`, `Surface`, `AppGrid`, `SettingSection`, or another existing primitive?
- Did it introduce a hardcoded color?
- Did it introduce a repeated raw pixel value?
- Does it work in both light and dark mode?
- Does the page align to the app grid?
- Are controls visible, focusable, and consistent?
- Does the feature file mostly describe product structure rather than styling glue?
