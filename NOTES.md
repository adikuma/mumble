# Mumble Notes

Continual log of bug fixes, design decisions, and learnings. Newest entries on top.

---

## 2026-05-01: feature/mumble-backend - frontend rewrite to Claude Design system

### Changes
Tore down the warm-cream variant (`hsl(40 30% 98.5%)` background, emerald `--brand`, Inter + JetBrains Mono fonts, `--radius: 10px`) and replaced with the Claude Design output: shadcn neutral tokens (`hsl(0 0% 100%)` light, full inverse dark), Geist Sans only (`--font-mono: var(--font-sans)` so existing `font-mono` classes still render Geist), `--radius: 0.5rem`, no chromatic accent, sidebar kept warm cream (`hsl(48 33% 97%)`) as the one explicit override of the no-warm-tints rule.

Files rewritten: `src/index.css`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/sidebar.tsx`, `src/components/theme-toggle.tsx`, `src/features/history/HistoryView.tsx`, `src/features/settings/SettingsView.tsx`, `src/App.tsx`, `index.html` (title fix). New: `src/components/app-header.tsx`. Bundled: `public/fonts/Geist-Variable.woff2`. Installed: `@/components/ui/dropdown-menu` (for the new 3-way theme toggle).

### Lucide-react: bumped 1.8.0 → 1.14.0; no Github icon
The repo had `lucide-react@^1.8.0` which is from 2022 and missing many icons. Bumped to 1.14.0 for full coverage. Lucide 1.x dropped brand icons (presumably licensing) — `Github` is no longer exported. Swapped to `ExternalLink` for the "View on GitHub" link in Settings → About. Honest semantically (clicking it opens an external page) and matches the design's "lucide-only" rule.

### Removed: brand variant from Button + Badge
Design has no chromatic accent — `--brand` token deleted. `buttonVariants.brand` and `badgeVariants.brand` were the only consumers; removed. `link` button variant changed from `text-brand` → `text-foreground`.

### Refactored: react-hooks/exhaustive-deps suppression
Old `HistoryView.tsx` had `// eslint-disable-next-line react-hooks/exhaustive-deps` on the search debounce effect because `refresh()` closed over `query` + `setTranscripts`. Inlined the fetch logic into the effect so the dep array reflects exactly what's used; suppression removed.

### Learning
When you tear down a feature flag / theme variant, also audit `cva` variants and shadcn primitives that referenced the dropped tokens. `Button.brand` and `Badge.brand` were leftover landmines that would still compile and silently break any caller still passing `variant="brand"`. Compile/typecheck doesn't catch dead variants.

---

## 2026-05-01: feature/mumble-backend - sherpa-onnx CMake configure fails on Windows 11 24H2+

### Problem
`pnpm tauri dev` on Windows 11 build 26200 (24H2) failed during the sherpa-rs-sys CMake configure step:

```
-- OS used to build sherpa-onnx: NOTFOUND
CMake Error at cmake/show-info.cmake:66 (string):
    string sub-command REPLACE requires at least four arguments.
```

### Root cause
sherpa-onnx (via sherpa-rs-sys 0.6.8) uses `wmic os get caption,version` to detect the Windows version inside `cmake/show-info.cmake`. Microsoft removed `wmic.exe` from Windows 11 24H2 onwards, so the command runs but returns nothing. CMake 4.3 then trips on `string(REPLACE "\n" ";" var ${empty})` because `${empty}` expands to zero arguments and `string(REPLACE)` requires at least four. CMake 3.x was lenient about this; 4.x is strict.

### Fix (temporary)
Patched `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/sherpa-rs-sys-0.6.8/sherpa-onnx/cmake/show-info.cmake` lines 57-70:
- Added `ERROR_QUIET` to the wmic execute_process so the missing binary does not surface
- Wrapped the `string(REPLACE)` call in `if(SHERPA_ONNX_OS_TWO_LINES)` to skip it when the var is empty
- Quoted `"${SHERPA_ONNX_OS_TWO_LINES}"` so even non-empty values pass as a single argument
- Added an `else` branch that sets `SHERPA_ONNX_OS` to `"Windows ${CMAKE_SYSTEM_VERSION}"` as a fallback

### Caveat
This patch lives in the cargo registry cache. It survives `cargo clean -p sherpa-rs-sys` but will be wiped silently on `cargo update` of sherpa-rs or any global cargo cache invalidation. Long-term fix: fork sherpa-rs-sys, commit the patch, and use `[patch.crates-io]` in `src-tauri/Cargo.toml` to pin to the fork. File an upstream PR against `k2-fsa/sherpa-onnx` while you are at it.

### Learning
Be wary of any C++ build script that shells out to OS-specific tools for cosmetic reasons (banner strings, version reporting). They tend to bit-rot fastest because they are not on the critical path and nobody notices when they break in a new Windows release.
