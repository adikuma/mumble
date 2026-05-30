# Mumble ASR Benchmark

Generated 2026-05-24.

Local benchmark of the Parakeet-TDT-0.6B-v3 model Mumble ships (sherpa-onnx on ONNX Runtime), comparing the **int8** build we currently use against the **fp32** build, on a subset of LibriSpeech test-clean. The goal is two things: confirm our local run is close to the published reference, and measure the int8 vs fp32 tradeoff in accuracy, speed, and memory so we can expose it as a settings option.

## Results

| Variant | Utterances | WER % | CER % | RTF | RTFx | Model RAM (MB) | Peak RAM (MB) | Load (s) |
|---|---|---|---|---|---|---|---|---|
| int8 | 150 | 1.69 | 0.64 | 0.036 | 27.4 | 722.8 | 2171.6 | 1.72 |
| fp32 | 150 | 1.44 | 0.47 | 0.08 | 12.5 | 2286.1 | 3879.0 | 2.69 |

Published reference (NVIDIA, Open ASR Leaderboard): **1.93% WER** on full LibriSpeech test-clean. Our subset run should land in the same neighborhood, confirming the setup is correct.

## Model

[Parakeet-TDT-0.6B-v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) by NVIDIA, licensed CC-BY-4.0, trained on a multilingual ASR corpus dominated by English read and conversational speech (LibriSpeech, CommonVoice, VoxPopuli, MLS, plus NeMo internal data). Known limitations: English first with degraded accuracy on heavy accents, code switching, and overlapping speakers, no diarization, no timestamp tokens in the int8 build we ship, and the model emits punctuation and casing so downstream consumers must not assume lowercase normalized output.

## Method

- **Model**: the same Parakeet-TDT-0.6B-v3 ONNX assets the app loads, run through the `sherpa-onnx` Python package. It wraps the same C++ core as the Rust `sherpa-rs` crate, so accuracy is identical to what Mumble ships.
- **Decoding**: greedy search, 16 kHz mono, feature dim 80, fixed thread count, one model per process so memory is measured cleanly.
- **Dataset**: LibriSpeech test-clean, streamed from the HuggingFace parquet revision so no dataset loader script is executed, first N utterances.
- **Scoring**: `jiwer` for WER and CER, after normalizing both reference and hypothesis with the Whisper `EnglishTextNormalizer` (the Open ASR Leaderboard standard). Normalization matters because Parakeet emits punctuation and casing while the references do not, so raw scoring would unfairly penalize formatting rather than accuracy.
- **RTF** = processing time / audio duration (lower is faster); **RTFx** is its inverse. **Model RAM** = resident memory added by loading the model; **Peak RAM** = peak resident memory during decoding.

## Supply chain

All Python dependencies are pinned to mature, maintainer-verified releases in `bench/requirements.txt` and installed as prebuilt wheels only. Model assets come from the legitimate sherpa-onnx maintainer (`csukuangfj` / k2-fsa) on HuggingFace.

## Reproduce

See `bench/README.md`.
