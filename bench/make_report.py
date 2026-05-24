"""compose BENCHMARK.md at the repo root from the per variant json in out/.

reads out/int8.json and out/fp32.json (whichever exist) and writes a results
table plus methodology so the benchmark stays reproducible and reviewable.
"""

import json
from datetime import date
from pathlib import Path

BENCH_DIR = Path(__file__).parent
OUT_DIR = BENCH_DIR / "out"
REPORT_PATH = BENCH_DIR.parent / "BENCHMARK.md"
VARIANTS = ["int8", "fp32"]

# published nvidia reference for parakeet tdt 0.6b v3 on librispeech test clean,
# used as a correctness target for our local run (open asr leaderboard).
REFERENCE_WER_TEST_CLEAN = 1.93


def load(variant):
    path = OUT_DIR / f"{variant}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def table_row(r):
    return (
        f"| {r['variant']} | {r['utterances']} | {r['wer_pct']} | {r['cer_pct']} "
        f"| {r['rtf']} | {r['rtfx']} | {r['model_rss_mb']} | {r['peak_rss_mb']} "
        f"| {r['load_sec']} |"
    )


def main():
    results = [r for r in (load(v) for v in VARIANTS) if r]
    if not results:
        raise SystemExit("no results in out/. run benchmark.py first.")

    lines = [
        "# Mumble ASR Benchmark",
        "",
        f"Generated {date.today().isoformat()}.",
        "",
        "Local benchmark of the Parakeet-TDT-0.6B-v3 model Mumble ships "
        "(sherpa-onnx on ONNX Runtime), comparing the **int8** build we currently "
        "use against the **fp32** build, on a subset of LibriSpeech test-clean. "
        "The goal is two things: confirm our local run is close to the published "
        "reference, and measure the int8 vs fp32 tradeoff in accuracy, speed, and "
        "memory so we can expose it as a settings option.",
        "",
        "## Results",
        "",
        "| Variant | Utterances | WER % | CER % | RTF | RTFx | Model RAM (MB) "
        "| Peak RAM (MB) | Load (s) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(table_row(r))
    lines += [
        "",
        f"Published reference (NVIDIA, Open ASR Leaderboard): "
        f"**{REFERENCE_WER_TEST_CLEAN}% WER** on full LibriSpeech test-clean. Our "
        "subset run should land in the same neighborhood, confirming the setup is "
        "correct.",
        "",
        "## Method",
        "",
        "- **Model**: the same Parakeet-TDT-0.6B-v3 ONNX assets the app loads, run "
        "through the `sherpa-onnx` Python package. It wraps the same C++ core as "
        "the Rust `sherpa-rs` crate, so accuracy is identical to what Mumble ships.",
        "- **Decoding**: greedy search, 16 kHz mono, feature dim 80, fixed thread "
        "count, one model per process so memory is measured cleanly.",
        "- **Dataset**: LibriSpeech test-clean, streamed from the HuggingFace "
        "parquet revision so no dataset loader script is executed, first N "
        "utterances.",
        "- **Scoring**: `jiwer` for WER and CER, after normalizing both reference "
        "and hypothesis with the Whisper `EnglishTextNormalizer` (the Open ASR "
        "Leaderboard standard). Normalization matters because Parakeet emits "
        "punctuation and casing while the references do not, so raw scoring would "
        "unfairly penalize formatting rather than accuracy.",
        "- **RTF** = processing time / audio duration (lower is faster); **RTFx** "
        "is its inverse. **Model RAM** = resident memory added by loading the "
        "model; **Peak RAM** = peak resident memory during decoding.",
        "",
        "## Supply chain",
        "",
        "All Python dependencies are pinned to mature, maintainer-verified "
        "releases in `bench/requirements.txt` and installed as prebuilt wheels "
        "only. Model assets come from the legitimate sherpa-onnx maintainer "
        "(`csukuangfj` / k2-fsa) on HuggingFace.",
        "",
        "## Reproduce",
        "",
        "See `bench/README.md`.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(lines))
    print(f"wrote {REPORT_PATH}")


if __name__ == "__main__":
    main()
