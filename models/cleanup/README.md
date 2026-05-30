# cleanup

> Status: scaffolding — implementation in progress

Fine-tune a small local LLM (Qwen2.5-0.5B-Instruct) to clean Mumble dictation
transcripts: remove fillers, repeats, and false starts, fix punctuation and
casing, without rewriting or answering. Trains on a rented GPU over SSH and
exports ONNX for the Rust backend.

Read `docs/HANDBOOK.md` first. It explains the research, the fine-tuning
mechanism (SFT objective, AdamW, LoRA), the metrics, and what every file should
do. The `src/` and `scripts/` files are scaffolding: signatures and specs with
the implementation left to write.

## Pipeline (Makefile)

    make sync                 install deps via uv
    make data                 01: synthetic injection pairs + real eval set
    make train RUN_ID=r1      02: lora sft, writes runs/r1
    make evaluate RUN_ID=r1   03: base vs fine-tune on the real held out test
    make export RUN_ID=r1     04: merge lora + onnx export
    make benchmark RUN_ID=r1  05: cpu latency
    make pack RUN_ID=r1       06: tar + sha256 + the scp line
    make all RUN_ID=r1        the whole pipeline
    make smoke                tiny cpu run to check wiring (no gpu)

## Vast.ai

1. rent a cuda pytorch instance, note the ssh host and port.
2. ssh in, clone the mumble repo, `cd models/cleanup`.
3. `uv sync`.
4. `make all RUN_ID=r1`.
5. the pack step prints a sha256 and the scp line. pull the dist tarball off the
   box, verify the checksum on the laptop, then destroy the instance.

Nothing here runs automatically. Do not launch a Vast.ai run until the code and
the plan have been reviewed.
