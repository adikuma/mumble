# Fine-tune plan: dictation cleanup model (v1)

Status: design only, nothing runs yet. This captures the brainstormed plan for
fine-tuning a small local model to clean Mumble's dictation transcripts.

## Goal

Fix the one failure the Qwen2.5-0.5B prototype showed: on short or ambiguous
inputs it slips into assistant mode ("Yes,...", "Sure, I can...") and lightly
rewords. A task fine-tune removes this by making faithfulness structural in the
training data rather than something we only ask for in the prompt.

## Task definition

Input: raw speech to text output. Output: the same wording with

- filler words and disfluencies removed (um, uh, er, like as filler, you know),
- repeated words and false starts removed,
- punctuation and capitalization fixed.

Hard constraint: no rewording, no added facts, no answering questions in the
text. This is a delete and repunctuate task, not a generation task.

Out of scope for v1 (see limitations): list and paragraph formatting, and
robustness to real STT mis-recognitions. Both are deferred to v2.

## Base model

Qwen2.5-0.5B-Instruct.

- Apache-2.0 and ungated, so the fine-tuned weights can ship in a commercial
  desktop app with no license passdown and no gated download.
- Already validated in the prototype, so zero migration cost.
- Gemma 3 270M was the best engineered tiny base for this, but its gated Gemma
  Terms of Use and prohibited use policy travel with shipped weights, which is
  friction a paid product does not need. Gemma 4 is Apache-2.0 but its smallest
  size is 2.3B, too big for the latency budget.

## Data: synthetic injection only

Build training pairs by taking clean written text (the target) and corrupting
it to produce the raw side. Because the only difference between raw and clean is
inserted noise, the clean target is deletions plus punctuation away from the
raw input, so the model cannot learn to invent content or answer questions.

Clean text source: a few thousand short clean English sentences, seeded with
some conversational and instructional sentences for domain flavor (Mumble
dictation is commands and prose, not encyclopedia text).

Corruption recipe (LARD style injector, github.com/tatianapassali/artificial-disfluency-generation):

- lowercase the text and strip punctuation, to teach punctuation and
  capitalization restoration.
- insert filler words (um, uh, like, you know) at clause boundaries.
- duplicate words and short phrases, to teach repetition removal.
- inject false starts and replacements (say a few words, abandon, restart), to
  teach false start removal.

Target size: a few thousand pairs for v1. Each raw side gets a random subset of
the corruptions so the model sees varied noise.

Why not the other options: existing datasets (DisfluencySpeech, CoEdIT gec)
were the simple alternative and distillation was the way to capture real STT
noise and formatting, but injection only is the cheapest and the most faithful,
which matches the v1 priority of killing hallucination. Distillation can be
added in v2 for formatting and real noise.

## Method

LoRA fine-tune (not QLoRA, not full) with transformers plus peft plus trl
SFTTrainer.

- LoRA: r 8 to 16, lora_alpha 16 to 32, lora_dropout 0.05, target the four
  attention projections (q, k, v, o).
- optimizer: lr 1e-4 to 2e-4, cosine schedule, ~3 percent warmup.
- epochs: 2 to 3.
- effective batch 16 to 32 via small per device batch plus gradient
  accumulation, max sequence length 512 to 1024.
- completion only loss, so the prompt and instruction tokens are masked and the
  model is trained only on the clean target.

## Compute and infrastructure: Vast.ai

This machine has no NVIDIA GPU (AMD integrated Radeon 860M), so training runs on
a rented Vast.ai GPU instance over SSH. The fine-tune is therefore packaged as a
self contained, CLI driven model project following the GetSolar models
convention (see desktop/GetSolar/models/CONVENTIONS.md and the privacy-filter
example), so a fresh remote box can clone, install, and run the whole pipeline
with make targets, then ship the artifact back.

Lifecycle:
1. rent a cuda pytorch instance on vast.ai, note the ssh host and port.
2. ssh in, clone the repo (or rsync the models/cleanup dir up).
3. cd models/cleanup, then uv sync.
4. make all RUN_ID=r1, or run the stages one at a time.
5. the pack stage prints a sha256 and the scp command. pull the dist tarball off
   the box, verify the checksum on the laptop, then destroy the instance.

The train script is cuda aware (bf16 when supported, fp16 otherwise, cpu off) so
the same code runs on the rented gpu and on a local cpu smoke test.

## Project structure (GetSolar models convention)

models/cleanup/ is a self contained uv project:
- pyproject.toml, uv.lock, .python-version   pinned deps, own environment
- README.md                                  what it is, how to run, vast.ai steps
- Makefile                                   one line command per pipeline stage
- configs/inject.yaml, configs/train.yaml    no hyperparameters hardcoded in code
- src/cleanup/                               reusable library code
- scripts/                                   numbered thin entry points
- runs/<run_id>/                             per run outputs (config, metrics, model)
- dist/<run_id>.tar.gz                       packed artifact to scp off vast.ai
- docs/                                      design, data notes, model report
- tests/                                     unit tests for the pure functions

Numbered scripts (mirroring privacy-filter):
- 01_data.py        generate the synthetic injection pairs (train, val) and fetch
                    the real DisfluencySpeech test split for held out eval
- 02_train.py       lora sft on qwen2.5-0.5b-instruct, writes runs/<run_id>
- 03_evaluate.py    base vs fine tune on the held out real test, the four metric
                    suite plus the cleans a question adversarial check
- 04_export.py      merge the lora adapter and export onnx for the rust ort path
- 05_benchmark.py   cpu latency and memory of the cleanup model
- 06_pack_and_ship.py  render report.md, tar the run, print sha256 and scp steps

Makefile targets: sync, data, train, evaluate, export, benchmark, pack, all,
clean, with RUN_ID, LR, EPOCHS overridable, matching the privacy-filter pattern.

## Metrics

Training objective: standard causal LM cross entropy on the clean target,
completion only. Nothing exotic.

Evaluation suite, base model versus fine-tune, on a held out set:

1. ERRANT F0.5: edit quality, weights precision so a wrong edit costs more than
   a missed filler. Library: errant.
2. chrF: overlap with the gold clean. Library: sacrebleu.
3. disfluency removal F1: did the model delete the right tokens. Custom token
   diff, jiwer as the alignment backbone.
4. added content rate plus a semantic guard: fraction of output content words
   not present in the input, should be about zero. Backed by a sentence
   embedding cosine drift check. This is the critical faithfulness metric. A
   fine-tune that raises F0.5 but raises added content is a regression.

## How we gauge improvement

1. Held out test set: DisfluencySpeech official test split (250 real disfluent
   pairs, never used in training). Train is synthetic, test is real, which
   directly measures the synthetic to real jump.
2. Run base versus fine-tune on the identical inputs with greedy decoding.
3. Score both on the four metric suite, report one table (rows: base,
   fine-tune; columns: the four metrics). Win condition: higher F0.5 and
   disfluency F1 with added content rate held at about zero.
4. Qualitative before and after table on about 12 representative inputs,
   including the user's own real transcripts from history.db.
5. Adversarial behavioral test: feed a dictated question (um what's the capital
   of france) and confirm the fine-tune cleans it (What's the capital of
   France?) rather than answering it. This is the single most important test,
   since answering instead of cleaning is the exact failure the base model made.

## Limitations of v1

- Injection only training never sees real STT mis-recognitions, so the eval on
  the real DisfluencySpeech test split is what tells us if it generalizes.
- No list or paragraph formatting is learned. Deferred to v2.
- v2 path: add a faithfulness filtered distillation slice (a teacher model
  cleans real transcripts) to cover formatting and real noise.

## Integration path (later, not part of the fine-tune)

Once the fine-tune wins on the suite: merge the LoRA adapter into the base,
export to ONNX, and run it in the Rust backend via the ort crate already in the
stack, as a toggleable cleanup pass between transcription and paste, with the
added content / overlap guard falling back to the raw transcript when the
cleaned output looks unfaithful.
