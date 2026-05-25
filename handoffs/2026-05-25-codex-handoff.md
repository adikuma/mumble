# Mumble — Handoff for Codex (2026-05-25)

You are taking over **Mumble**, a local-first Windows push-to-talk voice dictation app.
Hold a hotkey, speak, release; audio is transcribed fully on-device and pasted at the
cursor. Think "Wispr Flow, but local and open." This doc covers the architecture, the
UI decisions made in the most recent session, and the ML/fine-tuning plan. Deep details
already live in other files — those are referenced by path, not duplicated here.

## Reference docs (read these, don't re-derive)

- `C:\Users\adity\CLAUDE.md` and `~/.claude/CLAUDE.md` — coding conventions (see "House rules" below).
- `NOTES.md` (repo root) — running log of bug fixes / decisions / learnings. **Append a new entry whenever you fix a bug or make a non-obvious decision.** Format: `## YYYY-MM-DD: branch - short description` at the top.
- `BENCHMARK.md` (repo root) — ASR accuracy benchmark, Parakeet int8 vs fp32 (WER/CER/RTF).
- `bench/FINETUNE_PLAN.md` — the fine-tuning plan for the cleanup LLM.
- `models/cleanup/docs/HANDBOOK.md` — full write-up of the cleanup model: matrix, LoRA mechanism, data, eval, export, Vast.ai lifecycle.
- `models/cleanup/README.md` + the numbered `scripts/01_data.py … 06_pack_and_ship.py` — the scaffolding (stubs, specs).

## House rules (non-negotiable — from the user's CLAUDE.md)

- **Commits:** single line only, conventional format `type: description` (feat/fix/chore/test/docs). **Never** multi-line bodies, **never** `Co-Authored-By`/attribution lines.
- **Comments:** all lowercase, no hyphens, no em-dashes, no semicolons-as-symbols. Preserve identifier casing inside comments. No inline imports. No leading-underscore names in any language.
- **Package manager:** `pnpm` / `pnpx` only. Never `npm`/`npx`.
- **Python:** `uv` only (not pip/venv).
- **Plan mode:** only when the user explicitly says "plan this". Otherwise execute directly.
- **Do not run the fine-tune.** The user writes the model code themselves (deliberately, to avoid cognitive debt). Your job on the ML side is scaffolding, specs, and infra — not implementing the training loop, and never kicking off a Vast.ai run unless told.

## Repo layout

```
mumble/
  src/                      # react 19 + vite + tailwind v4 frontend (webview2)
    App.tsx                 # hash routing: home | insights | dictionary | settings | indicator
    index.css               # tailwind v4 @theme inline, all design tokens, utilities
    store.ts                # zustand store (transcripts, settings)
    lib/tauri.ts            # typed wrappers over tauri invoke() commands
    lib/utils.ts            # cn(), formatRelative, formatDuration, formatHotkey
    components/
      shell/                # app-shell, sidebar, topbar, panel  (the frame)
      ui/                   # shadcn/ui primitives (new-york, stone): accordion, select, switch, dialog, input, button
      kit/                  # app-specific primitives: stat-card, search-bar, wpm-gauge, bar-list, app-icon-grid
      theme-toggle.tsx
    features/
      home/                 # HomeView, TranscriptAccordion, home-helpers, history grouping
      insights/             # InsightsView (stats + heatmap + charts), insights-helpers
      dictionary/           # DictionaryView (inline add row), dict-row
      settings/             # SettingsView (page) + general/appearance/audio/about panels + setting-row
      history/              # AppIcon (real exe icons via get_app_icon)
      indicator/            # MicIndicator pill (separate transparent tauri window at #/indicator)
  src-tauri/src/            # rust backend
    lib.rs                  # tauri builder, command registration, window setup
    commands.rs             # #[tauri::command] surface called from the frontend
    pipeline.rs             # capture -> transcribe -> dictionary -> paste orchestration
    audio.rs                # cpal capture, resample to 16k, normalize_peak
    asr.rs / model*.rs      # sherpa-onnx Parakeet-TDT-0.6B-v3 int8 wrapper
    target_app.rs           # foreground app + exe path (and HWND for paste re-focus)
    paste.rs                # clipboard + synth Ctrl+V (SendInput)
    history.rs              # rusqlite history.db (transcripts, dictionary tables)
    settings.rs             # persisted settings (hotkey, autoPaste, preRollMs, inputDevice...)
  public/
    bg-light.png            # 80x45 pixelated atmospheric bg (light)
    bg-dark.png             # 80x45 pixelated atmospheric bg (dark)
    fonts/Geist-Variable.woff2
  bench/                    # asr benchmark harness + cleanup-llm prototype + fine-tune plan
  models/cleanup/           # cleanup model sub-project (uv, numbered scripts) — SCAFFOLDING ONLY
  models/                   # downloaded model artifacts (gitignored)
  NOTES.md  BENCHMARK.md  CLAUDE.md
```

## Architecture (how it works)

**Stack:** Tauri 2 (Rust backend + WebView2 frontend, frameless window) · React 19 +
Zustand + Vite + Tailwind v4 (`@theme inline`, bare-HSL tokens) · shadcn/ui (new-york,
stone base) · rusqlite for history · sherpa-onnx for ASR.

**Dictation pipeline (`pipeline.rs`):**
1. Global hotkey press starts `audio.rs` capture (cpal). A separate always-on-top
   transparent indicator window (`#/indicator`, `MicIndicator`) shows a recording pill
   with a red dot, a "Speak now" pre-speech cue, and a running timer.
2. On release: stop capture, resample to 16 kHz, `normalize_peak` (peak-normalize to
   0.95, skip below a noise floor, boost-only, capped ~12x) to fix low-volume flakiness.
3. Transcribe via sherpa-onnx **Parakeet-TDT-0.6B-v3 int8** (encoder/decoder/joiner
   `.int8.onnx`). Batch mode: file-in, string-out, no streaming.
4. Apply the user dictionary (learned corrections, `history.rs`).
5. Paste at cursor: copy to clipboard, then synth Ctrl+V (`paste.rs`).
6. Persist transcript + metadata (target app, exe path, duration) to `history.db`.

**Known backend issue (task #57):** paste is flaky because the pipeline does not
re-focus the captured target window before sending Ctrl+V, and the always-on-top
indicator holds foreground. Fix path: capture target HWND in `target_app.rs`, hide the
indicator + `SetForegroundWindow(target_hwnd)` (with the `AttachThreadInput` workaround)
before `synth_ctrl_v`, and surface `SendInput` failures via `tracing`. Diagnostics were
added in commit `3e48fa8`.

**fp32 vs int8 decision:** ship int8 by default; keep fp32 as an optional download.
Surface it in Settings as a choice showing memory usage vs quality. See `BENCHMARK.md`.

## UI / design decisions (most recent session — the heavy work)

Design language: warm-stone light + zinc dark, frosted-glass surfaces floating over a
pixelated atmospheric background, low roundedness, accent lives in the bevel.

**Design tokens (`src/index.css`):**
- `--radius: 0.5rem`. Roundedness reduced globally: panel 16px, cards 13px, inputs/rows 11px, buttons/nav/toggles 8px, pill 12px.
- **Accent = `--primary`, theme-dependent: amber in light (`38 92% 50%`), purple in dark (`248 70% 72%`).** Light `--primary-foreground` is dark (`30 45% 12%`) for contrast on amber. This is the single source of truth — charts and controls all key off it.
- Type scale 11/13/15/18px (`--text-xs..lg`). Font: Geist Variable (single face, `tabular-nums` for numbers).

**Background (`.panel-bg` + `components/shell/panel.tsx`):**
- `Panel` is split into a **non-scrolling absolute bg layer** + a **scrolling content layer**. This is deliberate: it lets a CSS `filter` apply to the bg only, never the content.
- `.panel-bg` = a card-colored scrim gradient over `url(/bg-*.png)` with `image-rendering: pixelated` (tiny 80x45 source upscaled blocky). Contrast tuning: **light `filter: contrast(1.18)`** (no brightness boost — a brightness>1 blew light mode out to white), **dark `filter: contrast(1.5) brightness(0.92)`**. Scrim: light `0.3 → 0.44`, dark `0.5 → 0.66`.
- The user supplies bg art; full-res images must be **downscaled to 80x45** (PowerShell `System.Drawing`, HighQualityBicubic) into `public/` to keep the pixelated look consistent. Filenames are reused, so Vite caches — a **hard refresh / `tauri dev` restart** is needed after swapping an image.

**Surfaces:**
- Sticky page headers are **fully transparent** (`sticky top-0 z-10 -mx-9 px-9 pt-9 pb-4`, no bg, no blur, no border) so they blend into the pixelated bg instead of forming a band.
- Content cards are neutral glass: `bg-card/68 backdrop-blur-md` + `surface-3d` (neutral bevel) + `shadow-lift`. **No black/white/full borders** — the user explicitly rejected those.
- Insights cards were unified from the warm `bg-accent` to `bg-card/68` to match every other surface.
- Settings: each section is **one card with internally divided rows** (mirrors the Home transcript accordion). `SettingRow` is now a plain `border-b last:border-b-0` row; each panel wraps its rows in the shared card div.

**Accent-on-bevel (the key recent decision):**
- `.surface-3d` = neutral bevel (white top highlight + faint bottom shadow), on every glass card.
- `.surface-3d-accent` = **bevel only, no ring/border** — just a tinted top highlight + bottom shadow. **Amber in light, purple in dark.** The user was firm: the accent color must live in the 3d bevel, never as a full fill or a full 1px ring.
- Applied only to **purple/accent controls**: the Dictionary "Add new" button (glass surface, accent-colored text, accent bevel — no solid fill) and the Switch on-state (glass track + accent bevel; the thumb flips to `foreground` when checked so it stays visible on the glass track in both themes).

**Charts follow the token:** heatmap shades, streak badge, WPM gauge arc, bar-list bars,
and the edit-correction flash keyframe all use `hsl(var(--primary) …)` → amber in light,
purple in dark automatically.

**Other shell decisions:**
- Sidebar nav: home / insights / dictionary / settings. Settings is a **page**, not a modal.
- Theme toggle lives in **Settings → Appearance** (not the topbar).
- Sidebar toggle is visually disabled below 760px width (`canToggleSidebar`), since it has no effect there.
- Home search + clear-all were removed. Scratchpad feature was deleted entirely (frontend views + backend `notes` table/commands).
- Content max-width 880px.
- Scroll fix: `overscroll-behavior` is on `html,body,#root` (not `*`), plus `overscroll-contain` on the scroll layer — fixes the wheel being trapped over `overflow-hidden` cards in WebView2.

## ML / deep-learning: the cleanup LLM (why + how)

**Why:** Parakeet produces accurate but raw transcripts — disfluencies ("um", "uh",
"like"), restarts, run-ons, missing punctuation. We want an **optional, toggleable**
post-processing layer that cleans dictation into polished text **without rewriting
meaning** (faithful by construction). It must be small enough to run locally.

**What we're fine-tuning:**
- **Base:** `Qwen2.5-0.5B-Instruct` (Apache-2.0, sub-700M params). Chosen over Gemma 3 300M for license + instruction-following quality at this size.
- **Task:** remove fillers/disfluencies, fix punctuation/casing, light formatting. **No paraphrasing, no summarizing, no added content.**
- **Method:** LoRA SFT (supervised fine-tuning), AdamW optimizer, cross-entropy loss, **completion-only loss** (mask the prompt, train only on the cleaned output). The system prompt is fixed (`models/cleanup/src/cleanup/prompts.py`).
- **Data strategy: synthetic injection only.** Start from clean text, programmatically inject disfluencies/transcription artifacts to synthesize the "raw" side. The clean original is the target — so every pair is faithful by construction (no hallucinated rewrites in the labels). See `bench/FINETUNE_PLAN.md` and the `inject` config.
- **Eval metrics:** judge improvement on disfluency-removal rate, punctuation F1, and a faithfulness/edit-distance guard (so it cleans without drifting from meaning). Measured against current Parakeet transcriptions.
- **Export:** ONNX via `optimum`, so the Rust `ort` crate can run it inside the app, the same way ASR runs. fp32 ships as the optional download.

**Training infrastructure:** runs on **Vast.ai over SSH**, not the user's local GPU.
Lifecycle (in the scripts / HANDBOOK): provision → train → pack artifacts → `scp` down →
verify SHA256 → **destroy the instance**. Follows the GetSolar `models/` convention
(self-contained `uv` project, numbered scripts `01_data … 06_pack_and_ship`, YAML configs,
`Makefile`, `runs/` + `dist/`).

**Current state of the ML work:** `models/cleanup/` is **scaffolding only** — every
`src/cleanup/*.py` and `scripts/0N_*.py` is a documented stub (specs + `NotImplementedError`),
except `prompts.py` which has the real system prompt. The user is writing the
implementation themselves. **Do not implement the training code or run anything on Vast.ai
unless explicitly asked.** The full rationale and matrix is in `models/cleanup/docs/HANDBOOK.md`.

## Current repo state & verification

- Branch: `main`. The voice fixes (commit `e1d329c`) and the ASR benchmark (commit `2f158a2`) are committed. Paste diagnostics in `3e48fa8`.
- **Uncommitted:** the large frontend UI stack from recent sessions (glassmorphism bg, transparent headers, settings-as-cards, amber/purple accent-on-bevel, scratchpad deletion, dictionary inline add, etc.) plus untracked `bench/` additions (`FINETUNE_PLAN.md`, `llm_cleanup.py`, `requirements-llm.txt`) and the `models/` tree. The user has not yet asked to commit the UI stack — confirm before committing, and commit in logical chunks.
- **Verification:** earlier UI passes were verified with `pnpm typecheck` + `pnpm build` (both green; bundle ~425 KB JS). The **most recent accent/bevel edits were NOT built** — the user was iterating live via HMR. **Before committing, run `pnpm typecheck && pnpm build` (and `pnpm format`, `pnpm lint`).** Rust: `cargo check` / `cargo build` in `src-tauri/`.
- Tooling commands: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`, `pnpm tauri dev`. Dev server: `http://localhost:1420`.

## Build gotcha (Windows)

`sherpa-rs-sys 0.6.x` cmake fails on Win11 24H2+ because of a `wmic` call in
`show-info.cmake`. Patch the wmic block if a clean build fails. (Recorded in memory /
NOTES.)

## Open items / where to pick up

1. The accent-on-bevel + amber/purple work needs a `pnpm typecheck && pnpm build` pass, then visual confirmation in light AND dark (light mode contrast can only be checked via a light screenshot; the user views dark live). Tune `filter`/scrim if light mode still looks off.
2. Paste flakiness (task #57) — the real bug, see backend section.
3. Dictionary apply not replacing (#37) and `extract_corrections` block mispairing (#36).
4. The LLM cleanup integration into the Rust `ort` pipeline + the int8/fp32 Settings option — only after the user finishes the model code.
5. Commit the uncommitted UI stack (with approval, in logical chunks, single-line conventional messages).

## Suggested skills (invoke if available)

- **`frontend-design:frontend-design`** — for any further UI/visual work. The user cares deeply about aesthetic precision and iterates fast; match the existing glass + bevel + pixelated-bg language, don't introduce generic patterns.
- **`superpowers:brainstorming`** — before scoping any new feature; present a design and get approval before implementing.
- **`review`** (builtin) — for Rust memory-safety / code-quality review passes (the user previously asked for this on the backend).
- Screenshot tooling (`peek`/`glance`/`truman` `screenshot`) — to show light/dark UI states; always surface the View URL.
- **`brainstorming` is NOT needed for the ML scaffolding** — that design is already captured in HANDBOOK.md / FINETUNE_PLAN.md.

## Working style notes (this user)

- Iterates on visuals rapidly and live (HMR). Prefers you make the edit and let them see it over long build/verify cycles mid-iteration. Run the full verify before committing, not after every tweak.
- Gives terse, directional feedback ("no full border, just the bevel"); read it literally and apply precisely. When a styling instruction is explicit, follow it exactly even if it diverges from convention.
- When genuinely forked between interpretations, ask one tight `AskUserQuestion` rather than guessing.
- Aditya, building this on Windows, learning Rust — consult `opensrc/repos/github.com/kitlangton/Hex` (the cloned Hex source) before Rust architecture decisions.
