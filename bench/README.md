# ASR benchmark

Measures WER, CER, real time factor, and memory for the Parakeet-TDT-0.6B-v3
model Mumble ships, comparing the int8 build against fp32 on a subset of
LibriSpeech test-clean. Latest results live in `../BENCHMARK.md`.

## Setup (Windows, PowerShell)

```powershell
cd bench
& "C:\Program Files\Python311\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
```

All dependencies are pinned and supply chain vetted (see `requirements.txt`).
`--only-binary=:all:` installs prebuilt wheels only, so no native code is
compiled locally.

## Download the models

int8 (~671 MB) and fp32 (~2.55 GB) from the sherpa-onnx maintainer on
HuggingFace:

```powershell
.\.venv\Scripts\python.exe download_models.py
```

## Run

```powershell
.\.venv\Scripts\python.exe benchmark.py --model-dir models\int8 --variant int8 --limit 150
.\.venv\Scripts\python.exe benchmark.py --model-dir models\fp32 --variant fp32 --limit 150
.\.venv\Scripts\python.exe make_report.py
```

`benchmark.py` runs one variant per process (clean memory measurement) and
writes `out/<variant>.json`. `make_report.py` merges both into `../BENCHMARK.md`.
