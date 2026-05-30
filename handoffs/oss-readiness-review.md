# Mumble — OSS production readiness review

**Overall rating: 6.1 / 10** &nbsp;·&nbsp; **Verdict: needs-work**

A multi-agent audit across security, frontend (tokens / architecture / quality), backend (mechanism / Windows gotchas / cleanliness), and OSS readiness. 8 specialist auditors, ~80 findings synthesized into a prioritized launch plan.

## tl;dr

The code is genuinely well-crafted at the unit level: SQL is fully parameterized, the token system is clean, the kit/ui split is respected, the state machine is race-free, and the backend modules are small, focused, and mostly documented. The blockers are concentrated in two places. (1) **OSS hygiene** — there is no `LICENSE`, no `NOTICE` for the Parakeet model attribution, no `SECURITY.md` despite a mic+keystroke surface, no `CONTRIBUTING.md`, the README points to a private absolute path, the Cargo crate is still named `mumble-scaffold`, and the wmic build failure that breaks every Win11 24H2 install is undocumented. (2) **Windows native correctness** — `Ctrl+V` is sent via `VK_PACKET` and silently no-ops in many apps, the captured paste target HWND is never re-focused so the indicator steals foreground, `cpal::Stream` is unsoundly forced `Send+Sync` and dropped across COM apartments, and hotkey press/release can re-order under load. Fix those two clusters and the project is ready for a real OSS launch.

## Dimension ratings

| Dimension | Rating | Note |
|---|---|---|
| Security | **7 / 10** | SQL safe, no secrets, minimal unsafe — but `csp: null`, no model integrity, undisclosed global hook, mic always-hot |
| Frontend design tokens | **7 / 10** | Strong Tailwind v4 token discipline + light/dark parity — but the indicator pill is a hex/rgba island that ignores the system |
| Frontend architecture | **7 / 10** | Clean kit/ui split, good bridge wiring — but the Zustand store carries 8 dead fields, no error boundary, hash routing in name only |
| Frontend logic & quality | **7 / 10** | Strict TS, no `any`, good comments — IndicatorWindow listener race, swallowed dictionary errors, lost-edit on save failure |
| Backend Rust mechanism | **6 / 10** | Thoughtful pipeline + state machine + chunker — but `expect` on db open, sqlite without WAL, heavy lock work in WASAPI callback |
| Backend Windows / gotchas | **5 / 10** | Disciplined GDI cleanup — but VK_PACKET Ctrl+V, no HWND re-focus, unsound `Send+Sync`, FFI callbacks not panic-guarded |
| Backend code cleanliness | **7 / 10** | Tight module boundaries, lowercase comments, anyhow at boundaries — `pipeline` over-exports, `TODO cleanup` logs ship, unused crates |
| OSS readiness | **3 / 10** | Lockfiles committed, NOTES.md is great — **no LICENSE, no NOTICE, no SECURITY, no CONTRIBUTING, broken README link, placeholder identifier** |

Weighted overall (security and Windows gotchas counted 2x because this is a Windows-native input-injecting app): **6.1**.

## Top 20 prioritized findings

### P0 — blocks any OSS publish

| # | Title | File | Fix |
|---|---|---|---|
| 1 | **No LICENSE at repo root** | `LICENSE` | Add Apache-2.0 LICENSE (compatible with all deps incl. Parakeet CC-BY-4.0). Set `license: "Apache-2.0"` in both `package.json` and `src-tauri/Cargo.toml`. |
| 2 | **No NOTICE for redistributed model + libs** | `NOTICE` | Add NOTICE listing Parakeet-TDT v3 / NVIDIA / CC-BY-4.0, sherpa-onnx / MIT, ONNX Runtime / MIT, Tauri / MIT+Apache-2.0. Surface "View licenses" in Settings → About. |
| 3 | **No SECURITY.md for audio+keystroke surface** | `SECURITY.md` | Add a SECURITY.md with private disclosure address, SLA, and a threat-model paragraph (what Mumble protects against and what it doesn't). |
| 4 | **README points to private path** | `README.md:79` | Delete the `/root/.claude/plans/...` line or move that plan into `docs/architecture.md` and link relatively. |
| 5 | **Missing Windows prerequisites in README** | `README.md` | Add a Prerequisites section listing rustup, MSVC build tools, CMake, Node ≥20, pnpm + a "first run downloads ~670 MB" note. |
| 6 | **wmic build failure undocumented (Win11 24H2+)** | `README.md` / `Cargo.toml` | Pin sherpa-rs via `[patch.crates-io]` to a fork with the wmic block patched (best) or document the manual patch with a link to `NOTES.md`. |
| 7 | **No CONTRIBUTING.md** | `CONTRIBUTING.md` | Document commit convention (single-line conventional, no co-author), comment/naming rules, quality gates (`pnpm format/lint/typecheck`, `cargo fmt/clippy -D warnings/test`). |
| 8 | **No .gitattributes — CRLF chaos cross-platform** | `.gitattributes` | Add `* text=auto eol=lf` + `*.{ps1,cmd,bat} text eol=crlf` + binary markers for `*.png *.onnx *.woff2 *.ico`. Re-normalize once after. |
| 9 | **Cargo package + Tauri identifier are placeholders** | `src-tauri/Cargo.toml:2`, `tauri.conf.json` | Rename `mumble-scaffold` → `mumble`, `mumble_scaffold_lib` → `mumble_lib`, `authors = ["you"]` → real author, identifier to a domain the author owns. Do this before any signed release — identifier changes break upgrade paths. |
| 10 | **Model downloads have no integrity verification** | `src-tauri/src/model_download.rs:6` | Hardcode SHA-256 per asset in the `ASSETS` table; verify after download; refuse to load on mismatch. Document digest source in `NOTES.md`. |
| 11 | **`csp: null` disables webview CSP** | `src-tauri/tauri.conf.json:51` | Set `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://huggingface.co; frame-ancestors 'none'`. |
| 12 | **`unsafe impl Send + Sync` for `CaptureEngine` is unsound** | `src-tauri/src/audio.rs:77` | Move the cpal stream onto a dedicated long-lived OS thread that owns it. Communicate via `crossbeam-channel` (already a dep). Remove the unsafe impls. |
| 13 | **Hotkey press/release can re-order under load** | `src-tauri/src/lib.rs:98` | Replace per-event `spawn_blocking` with a single mpsc/crossbeam channel consumed by one worker thread that calls `on_hotkey_press`/`release` in order. |
| 14 | **`expect` on `HistoryStore::open` crashes startup** | `src-tauri/src/lib.rs:36` | Open lazily; on `Err` log + rename to `history.db.bak.<ts>` + retry + fall back to in-memory store + surface a UI error event. |
| 15 | **`Ctrl+V` uses `Key::Unicode` → `VK_PACKET`** | `src-tauri/src/paste.rs:105` | Switch to `enigo::Key::Other(0x56)` (VK_V) or call `SendInput` directly with `KEYEVENTF_SCANCODE`. Reuse one `Enigo` instance across chunks. |
| 16 | **Pipeline never re-focuses captured target HWND** | `src-tauri/src/pipeline.rs:194` | Return the raw HWND from `current_foreground_app`. Right before each `paste_chunk` do `AllowSetForegroundWindow` → `AttachThreadInput` → `SetForegroundWindow(target_hwnd)` → `DetachThreadInput`. Drop indicator after paste. |

### P1 — OSS launch blockers (recoverable but visible)

| # | Title | File | Fix |
|---|---|---|---|
| 17 | **Global low-level keyboard hook has no user disclosure** | `src-tauri/src/hotkey.rs:46` | Add explicit privacy section in README + first-run onboarding stating the hook is installed, why (push-to-talk needs release events the global-shortcut plugin can't deliver), and that no keystrokes are stored. |
| 18 | **Indicator window activates + steals foreground on `show()`** | `src-tauri/src/pipeline.rs:385` | After creating the indicator webview, set `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` via `SetWindowLongPtrW`. Replace `win.show()` with `SetWindowPos(SWP_SHOWWINDOW | SWP_NOACTIVATE)`. |
| 19 | **Transcript sits in clipboard during paste window** | `src-tauri/src/paste.rs:39` | Document under Privacy in README + Settings. Add `SetClipboardData(CF_PRIVATEFIRST, ...)` so Windows clipboard history doesn't log it. Consider a "UIA typing" setting for high-sensitivity flows. |
| 20 | **`rdev` + `cpal` callbacks can panic across FFI** | `src-tauri/src/hotkey.rs:48`, `audio.rs` | Wrap both callback bodies in `std::panic::catch_unwind`. On caught panic: `tracing::error` + return `Default` + flip a flag the pipeline can surface to the user. |

## Top 5 things doing well

1. **SQL is fully parameterized.** `history.rs` uses `rusqlite::params!` everywhere — no string interpolation, no f-strings into SQL, even the `LIKE` wildcard `%` is added before bind so it stays a parameter.
2. **Token discipline is genuinely good.** Bare HSL triplets in `:root`/`.dark`, `hsl()` wrapping in `@theme inline`, consistent semantic utilities in features, strong light/dark parity, and an image-free grid-pattern `.panel-bg` that respects the documented flat thesis.
3. **State machine is race-free.** `AppState: AtomicU8` with `compare_exchange(AcqRel/Acquire)` gives a real linear state machine; the dictionary apply/extract is pure + unit-tested + respects word boundaries with longest-pattern-wins.
4. **Tauri bridge is StrictMode-safe.** `useBackendBridge` centralizes event subscriptions with a `cancelled` flag + `guard()` helper that handles the dev double-mount race correctly. Cross-window theme sync via `storage` event is elegant.
5. **Module boundaries are tight.** Backend files have single responsibilities, lowercase no-em-dash comments, module-level docstrings, rustdoc on public items, and inline tests on the pure modules (dictionary has 10 tests).

## Recommended cleanup order

1. **Legal & docs unblock (1 PR)** — Add `LICENSE` (Apache-2.0), `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, `.gitattributes`. Rename `mumble-scaffold` → `mumble`. Fix the README absolute path and add Windows prerequisites + wmic patch documentation. *Findings 1–9.*
2. **Security hardening (1 PR)** — Set a real CSP, hash-verify model downloads, split Tauri capabilities (main vs indicator), validate `get_app_icon` exe paths against known prefixes, add LRU cap to icon cache. *Findings 10–11 + security medium items.*
3. **Paste correctness (1 PR)** — Move clipboard+SendInput onto a dedicated COM-apartmented thread. Switch Ctrl+V to scancode-based SendInput. Capture and re-focus the target HWND before paste. Set `WS_EX_NOACTIVATE` on the indicator window so it never activates. *Findings 15, 16, 18 — these together fix the documented flaky paste (task #57).*
4. **Concurrency unsoundness (1 PR)** — Move `cpal::Stream` onto a dedicated capture thread with stable COM apartment. Remove `unsafe impl Send + Sync` from `CaptureEngine`. Serialize hotkey press/release through a single worker. Wrap rdev + cpal callbacks in `catch_unwind`. *Findings 12, 13, 20.*
5. **Robustness pass (1 PR)** — Lazy `HistoryStore::open` with recovery, sqlite `WAL`/`busy_timeout`, atomic `settings.json` write, watchdog timeout on stuck `Recording`/`Transcribing`/`Pasting` state, recover from `rdev::listen` returning. Demote all `// TODO cleanup` logs to `debug`. *Findings 14, mechanism mediums.*
6. **Frontend polish (1 PR)** — Delete the 8 dead Zustand slices + 4 unused shadcn primitives + unused tauri wrappers. Add an `ErrorBoundary` per webview. Fix React 19 purity violations (`greeting()`, `formatRelative`) with a `useNow` hook. Fix `IndicatorWindow` listener race with the bridge's cancelled guard pattern. Add toasts to dictionary add/delete error paths. Tokenize the indicator pill (kill the hex/rgba island). *FE findings.*
7. **Polish + tests** — Atomic-rename settings + clipboard restore retries, package.json metadata, BENCHMARK.md model card, archive `docs/design-from-claude/`, audio chunker unit tests, prefers-reduced-motion CSS block.

---

# Dimension detail

## Security &nbsp;·&nbsp; 7 / 10

> Mumble is a defensively written local-first app. SQL is fully parameterized, secrets are absent from the repo, unsafe blocks are minimal, and the Tauri capability surface is reasonably tight. The remaining risks are the things a dictation app inevitably has — a global low-level keyboard hook, an always-hot mic ring buffer, a clipboard-mediated paste race, and unverified model downloads — none catastrophic but all need disclosure or hardening before strangers should install this on a personal machine.

**Critical**
- Global low-level keyboard hook with no user disclosure — `hotkey.rs:46`
- Model downloads have no integrity verification — `model_download.rs:7`
- No Content Security Policy on the webview — `tauri.conf.json:51`
- Auto-paste lands in whatever window has focus when Ctrl+V fires — `pipeline.rs:194`
- Transcript sits in clipboard during the paste window (~120 ms) — `paste.rs:39`
- `rdev` crate is unmaintained — `Cargo.toml:65`
- Mic is always-hot at idle (ring buffer continuously fed for pre-roll) — `audio.rs:115`
- `get_app_icon` accepts arbitrary filesystem paths from frontend — `commands.rs:208`
- `hide_main_window`/`show_main_window` callable from indicator window — `commands.rs:166`
- `unsafe impl Send + Sync` on `CaptureEngine` is unsound — `audio.rs:77`
- No size/content limit on `update_transcript` text — `commands.rs:263`

**Quality**
- `TODO cleanup` `tracing::info` lines leak transcript previews to logs — `transcribe.rs:95`
- `settings.json` written without atomic replace — `settings.rs:97`
- History db opens without WAL or synchronous tuning — `history.rs:74`
- No documented threat model or SECURITY.md — `README.md`
- Unused `Win32_System_Registry` feature — `Cargo.toml:73`
- `copy_transcript` silently rewrites clipboard without UI feedback — `commands.rs:146`
- `redownload_model` deletes existing assets before fetch — `commands.rs:181`

## Frontend design tokens &nbsp;·&nbsp; 7 / 10

> Tailwind v4 `@theme inline` correctly wraps bare HSL triplets, light/dark parity is solid for nearly every token, `design-system.md` largely matches `src/index.css`, and feature code consistently uses semantic utilities. The drag on production readiness is the indicator pill (`MicIndicator.tsx`) which is a token-free island of hex/rgba gradients and decorative shadows that contradict the documented flat thesis.

**Critical**
- Indicator pill bypasses entire token system (hex hardcoded reds, purples, gradients, lift shadows, inner highlights) — `src/features/indicator/MicIndicator.tsx:57-78,90-108,126-134,205-209`
- Raw red palette in destructive hover bypasses `--destructive` — `src/features/home/TranscriptAccordion.tsx:208`
- `--popover-foreground` light-mode hue mismatches palette (cool `240 10% 3.9%` vs warm `0 0% 9%`) — `src/index.css:100`
- Declared `--border-strong` token has zero consumers — `src/index.css:118,158`
- `prefers-reduced-motion` not respected (accordion + mumble-flash + waveform animate unconditionally) — `src/index.css:62-82,272-281`

**Quality**
- Logo SVG carries baked-in blue stroke — `src/assets/logo-dark.svg:13`
- Theme-toggle uses `bg-white` literal — `src/components/theme-toggle.tsx:62`
- Heatmap + primary-tinted badge use ad-hoc opacity steps — `src/features/insights/InsightsView.tsx:209-221,259`
- Indicator window uses `var(--foreground)` without `hsl()` wrapper — `src/features/indicator/MicIndicator.tsx:64`
- Dark `.panel-bg` opacity tuning (0.046 vs 0.04) is undocumented — `src/index.css:265-270`
- Inline raw `text-[10px]/[11px]` outside the type scale — `src/features/insights/InsightsView.tsx:267,294`
- Indicator pill `rounded-[12px]` should use `rounded-xl` from the scale — `src/features/indicator/MicIndicator.tsx:52`

## Frontend architecture &nbsp;·&nbsp; 7 / 10

> Solid kit/ui split with clean Tauri bridge wiring and well-scoped panel primitives. The drags are: the Zustand store carries 8 dead fields, multiple React 19 purity violations (`Date.now`/`new Date` in render), routing is `useState` rather than real hash routing, no error boundary, and several unused shadcn primitives and unused tauri wrappers.

**Critical**
- React 19 purity violation: `greeting()` reads `new Date().getHours()` in render — `src/features/home/HomeView.tsx:19`
- `formatRelative()` reads `Date.now()` per render of every row — `src/features/home/TranscriptAccordion.tsx:100`
- Duplicate history fetch on Home mount (bridge + HomeView both call it) — `src/features/home/HomeView.tsx:32`
- No error boundary; `error` state in store is write-only — `src/lib/useBackendBridge.ts:40`
- Dead store fields: `appState, modelReady, error, download, historyLoading, selectedId, setSelectedId, removeTranscript, clearTranscripts` — `src/store.ts:5`

**Quality**
- Unused shadcn primitives (`dialog, dropdown-menu, sheet, separator`) — `src/components/ui/*`
- Unused tauri wrappers (`clearHistory, repasteTranscript, redownloadModel, hideMainWindow, showMainWindow, updateDictionaryEntry`) — `src/lib/tauri.ts:117`
- `Page` route type lives in `sidebar.tsx` and is imported by App.tsx — `src/components/shell/sidebar.tsx:6`
- Effective theme logic duplicated; doesn't subscribe to OS theme changes — `src/features/indicator/IndicatorWindow.tsx:25`
- Hash routing exists in name only — `src/App.tsx:11`
- Cross-feature import (`insights` → `home/home-helpers`) — `src/features/insights/InsightsView.tsx:21`
- `features/history` is a half-feature with no view — `src/features/history/AppIcon.tsx`
- `useBackendBridge` deps array re-runs effect unnecessarily — `src/lib/useBackendBridge.ts:98`
- `wpm` metric computed client-side disagrees with server words/sec — `src/features/insights/InsightsView.tsx:60`
- Route-level lazy loading missing — `src/App.tsx:25`

## Frontend logic & quality &nbsp;·&nbsp; 7 / 10

> Small, tightly scoped, largely well-typed with strict TypeScript, no `any`/`ts-ignore` in product code, consistent shadcn primitives. Bug surface is concentrated in a few effect lifecycles and async error paths.

**Critical**
- `IndicatorWindow` leaks event listeners on strict-mode remount — `src/features/indicator/IndicatorWindow.tsx:39-59`
- `HomeView.listHistory` throws unhandled in browser dev — `src/features/home/HomeView.tsx:32-34`
- `TranscriptAccordion` closes edit before save → lost draft on error — `src/features/home/TranscriptAccordion.tsx:68-93`
- `InsightsView` effect keyed on `transcripts.length` misses updates — `src/features/insights/InsightsView.tsx:49-57`
- `DictionaryView` swallows errors on add and delete — `src/features/dictionary/DictionaryView.tsx:29-52`
- Highlight `setTimeout` not cleared on unmount — `src/features/home/TranscriptAccordion.tsx:75`
- `use-update-settings` typed as `Record<string, unknown>` regressing `Partial<Settings>` — `src/features/settings/use-update-settings.ts:9`

**Quality**
- `MicIndicator` polls `getMeter` every 50ms without backpressure — `src/features/indicator/MicIndicator.tsx:197-202`
- Heights array doesn't resize when `bars` prop changes — `src/features/indicator/MicIndicator.tsx:168-170`
- `IndicatorWindow` theme not reactive to system changes — `src/features/indicator/IndicatorWindow.tsx:25-31`
- Heatmap day parsing uses local timezone (DST hazard) — `src/features/insights/InsightsView.tsx:244`
- `getAppIcon` double-null-coalesces — `src/lib/tauri.ts:177-180`
- `DictionaryView` re-filters on every render — `src/features/dictionary/DictionaryView.tsx:54-59`
- Settings patch dropped if `settings` is null on event — `src/lib/useBackendBridge.ts:86-91`
- `ThemeProvider` touches `window` at module scope — `src/components/theme-provider.tsx:11`
- `WindowControls` swallows `isMaximized` errors silently — `src/components/shell/window-controls.tsx:18-37`

## Backend Rust mechanism &nbsp;·&nbsp; 6 / 10

> Pipeline is thoughtfully designed — state machine via atomic, pre-roll ring buffer, chunked transcription, foreground-app capture and clipboard restore are all production-shaped. But it ships with concurrency landmines: unsound Send for `cpal::Stream`, `spawn_blocking` on hotkey events with no ordering, heavy work inside the cpal real-time callback, an `expect` that crashes on db open, and sqlite without WAL/busy_timeout.

**Critical**
- Unsound `unsafe Send for cpal::Stream` on Windows — `audio.rs:77`
- Hotkey press and release can re-order under load — `lib.rs:98`
- `expect` in startup crashes the whole app on db failure — `lib.rs:36`
- Sqlite opened without WAL or busy_timeout — `history.rs:85`
- Heavy mutex work inside the cpal real-time callback — `audio.rs:224`
- Transcriber init blocks a tokio worker for seconds — `lib.rs:109`
- Input device change is not honored without restart — `pipeline.rs:85`
- `settings.json` write is not atomic — `settings.rs:97`
- Model download has no resume and no integrity check — `model_download.rs:74`
- Transcribe with no capture engine emits empty audio + misleading error — `pipeline.rs:158`
- Enigo built per paste with no cleanup on failure (Ctrl stuck down) — `paste.rs:99`

**Quality**
- `thiserror` dependency is unused — `Cargo.toml:34`
- `new_id` uses nanos and may collide — `pipeline.rs:351`
- `TODO cleanup` info logs left in pipeline hot path — `pipeline.rs:190`
- `list_history` LIKE binding parameter is dead in the no-query branch — `history.rs:140`
- `get_app_icon` runs heavy GDI on Tauri command thread — `commands.rs:208`
- `stop_recording` can race with audio callback after flag flip — `audio.rs:204`
- Models dir lives in roaming `%APPDATA%` (sync nightmare for domain users) — `paths.rs:24`

## Backend Windows / gotchas &nbsp;·&nbsp; 5 / 10

> Only two genuine unsafe blocks and both are disciplined about GDI handle cleanup, but the Windows integration is brittle in the places that matter most for a push-to-talk app. The biggest gotchas: VK_PACKET Ctrl+V is unreliable across apps, the captured paste target is never re-focused, `cpal::Stream` is unsoundly declared `Send+Sync` and crosses tokio worker threads.

**Critical**
- `Ctrl+V` uses VK_PACKET via `Key::Unicode` — `paste.rs:105`
- Pipeline never re-focuses the captured target HWND — `pipeline.rs:194`
- `cpal::Stream` marked `Send + Sync`, dropped on wrong thread — `audio.rs:77`
- `rdev` callback and `cpal` callback can panic across FFI — `hotkey.rs:48`
- Indicator window activates and steals foreground on `show()` — `pipeline.rs:385`

**Quality**
- No COM apartment initialised for clipboard / SendInput thread — `pipeline.rs:179`
- Clipboard restore silently swallows errors — `paste.rs:66`
- `OpenClipboard` contention not retried — `paste.rs:40`
- `Enigo` allocated per chunk — `paste.rs:100`
- Stuck state if transcribe panics or hangs — `pipeline.rs:179`
- `QueryFullProcessImageNameW` size handling — `target_app.rs:33`
- `GetObjectW` on potentially NULL `hbmColor` — `app_icons.rs:84`
- `IconCache` grows unbounded — `app_icons.rs:9`
- Hotkey listener has no recovery if `rdev::listen` returns — `hotkey.rs:93`
- `AppState` ordinal cast can desync with enum (no `#[repr(u8)]`) — `state.rs:14`
- `TODO cleanup` tracing spam in hot path leaks target app names — `pipeline.rs:209`

## Backend code cleanliness &nbsp;·&nbsp; 7 / 10

> Structurally clean: small focused modules, consistent `anyhow` at boundaries, `parking_lot`/atomics for shared state, lowercase comments, good rustdoc on most public items. The cleanliness debts are a leaky public surface on `Pipeline`, leftover `TODO cleanup` logs, naming/convention violations, unused crates, and absent tests on the riskiest module (audio chunking).

**Critical**
- Leaky `Pipeline` public fields — `pipeline.rs:57-67`
- `TODO cleanup` debug logs ship to users — `pipeline.rs:190,209,229,251,270`, `paste.rs:48,53`
- Unused dependencies (`crossbeam-channel`, `directories`, `hound`) inflate build — `Cargo.toml:30,40,61`
- Leading-underscore parameter on non-Windows stub — `app_icons.rs:205`
- Em dash in user-facing tray tooltip — `tray.rs:24`
- `unsafe Send + Sync` without justified safety comment — `audio.rs:74-78`
- No tests for the audio chunker — `audio.rs:318`

**Quality**
- Hyphenated comments break local style rule — `app_icons.rs:54,104,162,169`
- Inconsistent error strategy (anyhow internal, String at boundary, thiserror unused) — `commands.rs:18`
- Magic numbers scattered across paste timing — `paste.rs:51,56,84`
- Missing rustdoc on public command handlers — `commands.rs`
- Dead `write_wav` with `#[allow(dead_code)]` — `audio.rs:375-390`
- `new_id` collision under burst — `pipeline.rs:351-358`
- `update_settings` accepts `serde_json::Value` blindly — `commands.rs:35-91`
- Tray strings hardcoded — `tray.rs:15-18,24`
- `delete_model` bails on first failure — `model_download.rs:128-139`
- Package still named `mumble-scaffold` / `mumble_scaffold_lib` — `Cargo.toml:2,9`

## OSS readiness &nbsp;·&nbsp; 3 / 10

> Technical bones are solid (lockfiles committed, reproducible bench, useful NOTES.md), but the repo is not OSS-launchable as-is. No LICENSE, no SECURITY.md, no CONTRIBUTING, no NOTICE, no `.gitattributes`, and several README pointers either point to private paths or are missing.

**Critical**
- No LICENSE file at the repo root — `LICENSE`
- No third-party NOTICE / attribution for model weights — `NOTICE`
- No SECURITY.md despite audio capture + keystroke injection — `SECURITY.md`
- README points to private absolute path `/root/.claude/plans/...` — `README.md:79`
- README missing Windows prerequisites and Parakeet model download note — `README.md`
- README does not document sherpa-onnx wmic build failure on Win11 24H2+ — `README.md`
- No CONTRIBUTING.md for humans — `CONTRIBUTING.md`
- No `.gitattributes` → cross-platform CRLF chaos — `.gitattributes`
- `tauri.conf.json` identifier and Cargo package name are placeholders — `src-tauri/Cargo.toml:2`
- Model download has no integrity verification — `src-tauri/src/model_download.rs:6`
- README repo-layout drifts from actual `src-tauri/src/` — `README.md:48`

**Quality**
- `AGENTS.md` is gitignored yet also committed — `.gitignore:35`
- BENCHMARK.md missing model-card / license section — `BENCHMARK.md`
- `docs/design-from-claude/` ships 40+ files including duplicate woff2 — `docs/design-from-claude/`
- `models/cleanup/` should signal "scaffolding" more loudly — `models/cleanup/README.md`
- `package.json` missing `license`, `author`, `repository`, `bugs` — `package.json:1`
- `tauri.conf.json` `csp: null` — `src-tauri/tauri.conf.json:51`
- Missing `docs/architecture.md` (state machine + IPC + data dir + sequence) — `docs/architecture.md`
- `bench/install.log`, `download.log`, `llm_run.log` committed — `bench/install.log`

---

*Generated by an 8-auditor multi-agent review. Source cached audits in `.audit-cache/*.json`.*
