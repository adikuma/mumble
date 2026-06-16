# Contributing to Mumble

Thanks for considering a contribution. Mumble is small, opinionated, and Windows-only, so a few conventions exist to keep the codebase coherent. Please skim this document before opening a pull request.

## Commit conventions

- Single-line conventional commit subjects: `type: short description`.
- Allowed types: `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, `style`, `perf`, `build`, `ci`.
- **Never** add multi-line bodies, footers, or `Co-Authored-By:` attribution lines.

Examples:

```
feat: add wpm meter to indicator
fix: reset paste worker on focus change
docs: clarify first-run model download
```

## Code style and naming

These rules apply to every language in the repo (Rust, TypeScript, Python).

- All code comments must be lowercase. Do not use em-dashes, hyphens at word boundaries, or stray punctuation symbols inside comments.
- Never prefix a function, variable, or method with a leading underscore. If you must mark something unused, accept the parameter normally and write `let _ = value;` (or the local equivalent) inside the body.
- Keep all imports at the top of the file. Inline imports inside functions are not allowed.
- Use camelCase for TypeScript variables and functions, PascalCase for React components and Rust types, CONSTANT_CASE for constants.

## Quality gates

Run these from the repo root before every commit:

```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

And from `src-tauri/`:

```
cargo fmt
cargo clippy -- -D warnings
cargo test
```

If you change Rust files but cannot build on Windows, run `cargo check --no-default-features` instead and call that out in the PR description.

## Notes log

Whenever you fix a non-obvious bug, make an architectural decision, or learn something surprising about the codebase, add a new entry at the top of `NOTES.md`. Entries follow the format documented at the top of that file: a dated section heading plus subsections for problem, fix, and learnings. Never delete or rewrite existing entries.

## Running the benchmark harness

Mumble's accuracy and latency are tracked under `bench/`. See [`bench/README.md`](bench/README.md) for the full workflow. Briefly:

```
cd bench
uv sync                       # python deps
uv run python download_models.py
uv run python benchmark.py    # WER + latency on the LibriSpeech subset
uv run python make_report.py  # writes a markdown report under bench/out/
```

The bench harness uses [`uv`](https://docs.astral.sh/uv/) rather than `pip`. Do not edit pinned versions in `requirements.txt` without a paired benchmark before/after.

## The cleanup model

The optional LLM-based transcript cleanup pass is **live** in the runtime. Inference is implemented in Rust under `src-tauri/src/cleanup_infer.rs` and `src-tauri/src/cleanup_model.rs`, gated behind the opt-in `cleanupEnabled` setting.

The directory `models/cleanup/` is a separate concern: it holds the Python **training and export** pipeline that produces the ONNX model the runtime downloads. The scripts under `models/cleanup/scripts/` and the package under `models/cleanup/src/cleanup/` are scaffolding, not part of the shipped app. Treat that subtree as a moving target and coordinate before changing it.

## Pull request checklist

- [ ] Conventional commit subject(s)
- [ ] No leading-underscore identifiers
- [ ] Comments lowercase, no em-dashes
- [ ] All quality gates pass
- [ ] `NOTES.md` entry added if applicable
- [ ] Tests added or updated where the change is testable
