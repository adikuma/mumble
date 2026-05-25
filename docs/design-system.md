# Mumble design system

Mumble is a quiet, cozy, minimal desktop dictation tool. The interface should feel calm, tactile, precise, and warm. It should have enough breathing room to feel comfortable during daily use, while staying compact enough for a utility app.

This document is the source of truth for frontend visual and component decisions. The system is strict by design. New UI should use these tokens, primitives, and patterns instead of inventing one off Tailwind class stacks.

## Visual thesis

Mumble is glass surfaces over atmospheric pixel art.

The app should keep:

- warm stone light mode and zinc dark mode
- glassmorphic content surfaces
- subtle bevels and soft lift shadows
- amber accent in light mode
- purple accent in dark mode
- low roundedness
- light borders only where structure needs them
- calm spacing with more breathing room than a dense dashboard

The app should avoid:

- random arbitrary Tailwind values
- loud full color fills for routine controls
- thick borders around every surface
- nested cards
- page specific button styles
- repeated class piles copied between screens
- transparent sticky headers that overlap scrolled content

## Layer model

Frontend styles should flow through these layers.

1. Tokens in `src/index.css`
2. Generic primitives in `src/components/ui`
3. Mumble primitives in `src/components/kit` or `src/components/shell`
4. Feature components in `src/features`
5. Feature views that compose components

Feature views should not define the design system. They should use it.

## Tokens

Tokens are named design decisions. Prefer tokens over hardcoded values.

Core token groups:

- color tokens: `background`, `foreground`, `card`, `muted`, `primary`, `border`, `input`, `ring`
- radius tokens: `sm`, `md`, `lg`, `xl`
- type tokens: `xs`, `sm`, `base`, `lg`
- app utilities: glass surface, bevel, accent bevel, lift shadow

If a value appears in multiple screens and communicates the product language, make it a token, utility, or component.

## Tailwind scale versus raw values

Tailwind scale classes are preferred for ordinary layout:

- `px-4`
- `py-3`
- `gap-4`
- `text-sm`
- `rounded-md`
- `size-4`

Raw arbitrary values are allowed only when the value is physically specific:

- fixed icon details, such as `size-[7px]`
- fixed columns, such as a timestamp width
- fixed app layout constraints, such as the main content max width
- chart cell gaps and heatmap geometry
- one off alignment correction that cannot become a reusable rule

Raw arbitrary values are not allowed for repeated design language:

- repeated page titles
- repeated section labels
- repeated surface radius
- repeated glass card classes
- repeated control height
- repeated accent colors
- repeated button styles

When in doubt, ask: is this a measurement or a design decision?

If it is a measurement, a raw value may be fine.
If it is a design decision, name it.

## Required app primitives

The frontend should expose these Mumble specific primitives.

### Page

Use for normal app screens.

Responsibilities:

- set the shared max width
- set horizontal page padding
- set bottom padding
- provide responsive breathing room

Current repeated pattern to replace:

```tsx
<div className="mx-auto w-full max-w-[880px] px-9 pb-9">
```

Target shape:

```tsx
<Page>
  ...
</Page>
```

### PageHeader

Use for screen titles and descriptions.

Responsibilities:

- title typography
- description typography
- sticky behavior if needed
- safe background treatment on scroll
- spacing below the header

The sticky header must never visually collide with scrolled content. If the header is sticky, it needs one of these:

- a real translucent background layer
- a subtle blur and scrim
- a scroll shadow or divider
- a layout where content cannot pass under readable text

Fully transparent sticky headers are not allowed when content scrolls underneath them.

### Surface

Use for Mumble glass content surfaces.

Responsibilities:

- glass card background
- bevel
- lift shadow
- light border if needed
- radius
- backdrop blur

Current repeated pattern to replace:

```tsx
bg-card/68 border-border surface-3d shadow-lift rounded-[13px] border backdrop-blur-md
```

Target shape:

```tsx
<Surface>
  ...
</Surface>
```

Surface variants:

- `default`: normal glass surface
- `interactive`: hover lift and stronger affordance
- `accent`: accent bevel only, not full fill or ring
- `plain`: glass background without border when the layout already gives structure

### SectionLabel

Use for small uppercase labels above grouped content.

Responsibilities:

- tiny label type
- uppercase
- letter spacing
- muted color
- consistent bottom margin

Current repeated pattern to replace:

```tsx
text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.07em] uppercase
```

Target shape:

```tsx
<SectionLabel>General</SectionLabel>
```

### SettingSection

Use for settings groups.

Responsibilities:

- section label
- one glass surface
- divided rows inside

Settings should be one surface per section, with internal row dividers. Do not make each setting row its own card.

Target shape:

```tsx
<SettingSection title="General">
  <SettingRow ... />
  <SettingRow ... />
</SettingSection>
```

### SettingRow

Use for a single setting.

Responsibilities:

- title
- optional description
- control slot
- row divider
- responsive wrapping

Rows must not overflow on narrow windows. Controls may wrap below text when space is constrained.

### StatusBanner

Use for model loading, downloads, backend errors, and other global operational states.

Responsibilities:

- make backend state visible
- use restrained styling
- provide clear action or dismissal when appropriate

Backend errors and download progress must not live only in the store.

## Typography

Use the app type scale by default:

- `text-xs`: metadata, helper labels, tiny controls
- `text-sm`: most UI labels and body text
- `text-base`: primary readable text
- `text-lg`: compact section emphasis

Named app text patterns should cover:

- page title
- page description
- section label
- stat value
- metadata
- row title
- row description

Raw title sizes like `text-[26px]` should move behind a `PageHeader` component or named class.

Letter spacing should be used sparingly:

- uppercase labels may use positive tracking
- normal body text should not use negative tracking
- large headings may use slight negative tracking only if codified in the page title pattern

## Color

Use semantic Tailwind color classes first:

- `bg-background`
- `text-foreground`
- `bg-card`
- `text-muted-foreground`
- `text-primary`
- `border-border`

Avoid hardcoded HSL values in feature files.

Allowed exceptions:

- custom heatmap intensity values
- highly specific generated visual effects
- temporary experiments before promotion into tokens

Accent meaning:

- amber in light mode and purple in dark mode are the brand accent
- accent should live primarily in bevels, active states, small badges, and key affordances
- routine controls should not become solid accent blocks unless they are truly primary actions

## Surfaces

The default Mumble surface is:

- `bg-card/68`
- `backdrop-blur-md`
- `surface-3d`
- `shadow-lift`
- low radius
- optional light border

Borders are structural, not decorative. Use borders for:

- row division
- separating glass surfaces from busy backgrounds
- focus and validation states

Avoid:

- full heavy borders around every element
- border plus ring plus shadow plus fill on the same resting element
- nested card inside card layouts

## Controls

All buttons and controls should come from primitives.

Use `Button` instead of hand rolled button classes.

Button variants should cover:

- `primary`: true primary action
- `secondary`: normal action
- `ghost`: quiet icon or text action
- `surface`: glass button with neutral bevel
- `accent`: glass button with accent bevel and accent text
- `destructive`: destructive action

Control rules:

- hover should be subtle
- focus must be visible
- disabled must be obvious
- active state can use accent bevel
- controls should share heights and radii
- icon buttons should use icon sizes from the primitive

The bevel should be consistent. Do not recreate accent bevel shadows inside feature files.

## Pixel background

The pixel background is part of the app identity.

Rules:

- background image lives behind the panel content only
- content must stay readable in both themes
- light mode must still show the atmospheric pixel effect
- background contrast is tuned through the panel background layer, not by changing content opacity randomly

Light mode currently needs improvement. The target is visible pixel atmosphere with enough surface contrast that text and controls still pop.

## Contrast and visibility

Everything must be readable and visibly interactive.

Minimum expectations:

- foreground text must clearly separate from surfaces
- muted text must remain readable
- controls must be discoverable at rest
- hover and focus states must be visible
- transparent elements must not overlap text underneath
- light mode and dark mode both need screenshots before visual changes are considered done

For glass surfaces, if the background is busy, increase the surface scrim or add a subtle border. Do not reduce text contrast to make the surface feel lighter.

## Raw px review checklist

When reviewing a class like `text-[13px]` or `rounded-[13px]`, decide:

1. Is this repeated?
2. Does it represent product language?
3. Would changing it later require searching many files?
4. Can it be a primitive prop, named class, or token?

If yes, remove the raw value from feature code.

## Componentization rule

Componentize product concepts, not CSS convenience.

Good components:

- `Page`
- `PageHeader`
- `Surface`
- `SectionLabel`
- `SettingSection`
- `SettingRow`
- `TranscriptAccordion`
- `DictionaryRow`
- `StatusBanner`

Avoid vague wrappers:

- `FancyBox`
- `FlexContainer`
- `StyledDiv`
- `CommonWrapper`

A component should make the screen read more like the product:

```tsx
<SettingSection title="Audio">
  <SettingRow title="Input device">...</SettingRow>
</SettingSection>
```

This is better than a screen full of class strings.

## Frontend cleanup order

Patch the frontend in this order:

1. Add Mumble primitives: `Page`, `PageHeader`, `Surface`, `SectionLabel`, `SettingSection`
2. Convert Settings first, because it is structured and repetitive
3. Fix sticky header overlap with a proper scroll-safe header treatment
4. Standardize button and control variants
5. Make backend error, model loading, and download state visible
6. Convert Dictionary, Home, and Insights to shared page and surface primitives
7. Tune light mode background and contrast with screenshots
8. Remove arbitrary design values from feature files

## Review standard

Before accepting frontend changes, check:

- Does this use existing primitives?
- Did this introduce a new raw pixel value?
- Did this introduce a hardcoded color?
- Does light mode still have atmospheric pixel depth?
- Does dark mode still preserve glass and bevel?
- Does any sticky element overlap content?
- Are controls visible, focusable, and consistent?
- Is the feature file mostly product structure rather than style glue?

