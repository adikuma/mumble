# Mumble cleanup model: handbook

The complete picture for the optional transcript cleanup model: the research
behind it, the fine-tuning mechanism in detail, the metrics, and what every file
should do. This is the reference to read before writing the code.

Nothing in this project runs automatically. Training happens on a rented GPU
only when you decide to launch it.

---

## 1. Where this fits

Mumble's dictation pipeline today:

    push-to-talk -> capture (cpal, 16kHz mono, gain normalized, pre-roll)
      -> Parakeet-TDT-0.6B-v3 (int8 ONNX via sherpa-onnx)
      -> custom dictionary substitution
      -> paste at cursor

The ASR model transcribes verbatim, including disfluencies ("um", "uh"),
repeated words, and false starts, and it has no idea about list or paragraph
structure. The cleanup model is an OPTIONAL pass inserted between transcription
and paste:

    ... -> Parakeet text -> [cleanup model, if enabled] -> paste

It removes fillers and disfluencies, fixes punctuation and capitalization, and
does light formatting, WITHOUT rewording, adding facts, or answering questions
in the text. This mirrors what Wispr Flow does.

---

## 2. Research recap

### 2.1 The ASR model and int8 vs fp32

Mumble ships **Parakeet-TDT-0.6B-v3** quantized to **int8** (the
`encoder.int8.onnx` etc. assets), run through sherpa-onnx on ONNX Runtime. We
benchmarked int8 against the fp32 build on 150 utterances of LibriSpeech
test-clean (see `bench/BENCHMARK.md`):

| Variant | WER % | CER % | RTF | Model RAM | Peak RAM |
|---|---|---|---|---|---|
| int8 (shipped) | 1.69 | 0.64 | 0.036 (27x realtime) | 723 MB | 2.17 GB |
| fp32 | 1.44 | 0.47 | 0.08 (12.5x realtime) | 2.29 GB | 3.88 GB |

Published NVIDIA reference is 1.93% on full test-clean, so our setup is correct.
Decision: **int8 stays the default** (2.2x faster, a third of the RAM, only 0.25
points of WER cost); fp32 becomes an optional download for users who want max
quality. Both numbers go in the Settings model-quality selector.

### 2.2 Why a cleanup model, and why fine-tune

A zero-shot prototype (Qwen2.5-0.5B-Instruct, plain prompt) cleaned real Mumble
transcripts well: it removed "and and" -> "and", "Claude Claude" -> "Claude",
fillers, and fixed punctuation, at about 1.7s per transcript on CPU. But on
short or ambiguous inputs it slipped into assistant mode ("Yes, ...", "Sure, I
can ...") and lightly reworded. A source-overlap guard caught those cases.

Fine-tuning fixes this at the root: instead of hoping a prompt constrains the
model, we teach the behavior from data. This is also why a 0.5B model is enough.
Google's whole pitch for tiny models is task-specific fine-tuning.

### 2.3 Base model choice

| | Gemma 3 270M | Qwen2.5-0.5B (chosen) | Qwen3-0.6B |
|---|---|---|---|
| License | Gemma ToU, gated, passes down to shipped weights | Apache-2.0, ungated | Apache-2.0, ungated |
| Notes | best tiny FT base on merits, but license friction for a paid app | already prototyped, zero migration | a bit more headroom, must disable thinking |

Gemma 4 is Apache-2.0 and ungated but its smallest size is 2.3B, far over our
latency budget. **Decision: fine-tune Qwen2.5-0.5B-Instruct.** Licensing is the
deciding factor for a shippable product; quality after fine-tuning on a task
this narrow is a wash across the candidates.

---

## 3. The data: synthetic injection only

### 3.1 The idea

We do NOT collect raw->clean pairs from real STT. Instead we take **clean
written text** (the target) and programmatically **corrupt** it to make the raw
input. Because every corruption is an insertion plus punctuation/casing removal,
the clean target is recoverable from the raw by deletion and repunctuation
alone. The model therefore **cannot learn to invent content** (the exact failure
we saw). Faithfulness is structural, not prompt-hoped-for. This is the whole
reason for choosing injection.

### 3.2 The corruption recipe (`configs/inject.yaml`, `src/cleanup/inject.py`)

Given a clean sentence:
- **false start**: prepend a duplicated 1-4 word head ("i want, i want to go").
- **repetition**: duplicate an internal 1-3 word span ("go to to the store").
- **fillers**: insert "um/uh/like/you know" at word gaps.
- **lowercase + strip punctuation**: always, so the model learns to restore
  casing and punctuation.

Each corruption fires with a probability from the config, so one clean sentence
yields many distinct raw variants (a few hundred clean sentences can generate
thousands of pairs).

### 3.3 Scope and the one caveat

- **v1 scope:** disfluency removal + punctuation/casing. Light formatting
  (lists, paragraphs) is NOT learnable from injection and is deferred to v2
  (which would add teacher distillation).
- **Caveat:** the clean source MUST be properly punctuated, capitalized written
  text, or the model never learns to restore punctuation. `01_data.py` prints
  sample pairs so you can confirm this on the first run. If the default source
  is bare speech transcript, switch `clean_source` in the config.
- **Train synthetic, evaluate real.** Training is synthetic, but the held-out
  test set is the REAL DisfluencySpeech test split (real disfluent speech with a
  gold clean target). That measures whether the synthetic->real jump holds.

---

## 4. The fine-tuning mechanism (read this before writing 02_train.py)

### 4.1 What supervised fine-tuning (SFT) is

The base model is a next-token predictor: given tokens so far, it outputs a
probability distribution over the next token. Fine-tuning continues training it
on our (prompt, target) pairs so that, given the cleanup prompt + a raw
transcript, it produces the clean transcript.

Each example is rendered with the chat template into one token sequence:

    <|im_start|>system\n {SYSTEM_PROMPT} <|im_end|>
    <|im_start|>user\n {raw} <|im_end|>
    <|im_start|>assistant\n {clean} <|im_end|>

### 4.2 The loss

Causal-LM cross-entropy (negative log-likelihood). For target tokens y_1..y_T,

    loss = - (1/T) * sum_t log p_theta(y_t | y_<t, prompt)

The model is rewarded for putting high probability on the actual next clean
token at every position. **Completion-only loss:** we mask every token up to and
including `<|im_start|>assistant\n`, so the loss is computed ONLY on the clean
target tokens. The model is never trained to reproduce the prompt or the raw
input, only to emit the clean output. (This is the `DataCollatorForCompletion
OnlyLM` with the assistant response template.)

### 4.3 Gradients and optimization

- **Forward pass:** tokens -> logits -> loss.
- **Backward pass (backprop):** autograd computes the gradient of the loss with
  respect to every trainable parameter, d(loss)/d(theta), by the chain rule.
- **Optimizer = AdamW.** For each trainable parameter it keeps two running
  averages: m (first moment, the mean/momentum of recent gradients) and v
  (second moment, the mean of squared gradients, a per-parameter variance). The
  update is roughly

      theta <- theta - lr * m_hat / (sqrt(v_hat) + eps)   then   theta <- theta - lr * wd * theta

  Dividing by sqrt(v) gives each parameter its own effective step size (large for
  consistently-signed gradients, small for noisy ones), which is why Adam-family
  optimizers are stable for transformers. The "W" is decoupled weight decay (the
  second term), a cleaner L2 regularizer than classic Adam.
- **Learning-rate schedule:** linear **warmup** for the first few percent of
  steps (ramp lr from 0 so early, large, random-direction updates do not
  destabilize the model), then **cosine decay** down toward 0.
- **Effective batch size = per_device_batch * grad_accum (* num_gpus).** Gradient
  accumulation runs several micro-batches, sums their gradients, and only then
  steps the optimizer, so you get the stability of a big batch without the
  memory of one.
- **Gradient clipping (`max_grad_norm`)** rescales the gradient if its norm
  exceeds a threshold, preventing a single bad batch from blowing up the weights.
- **Mixed precision:** bf16 (or fp16) for the forward/backward math is ~2x
  faster and uses less memory than fp32; tf32 speeds up matmuls on NVIDIA Ampere
  and newer. On CPU these are off (the smoke path).
- **Epochs:** full passes over the data. 2-3 is right for a few-thousand-pair
  SFT; more risks overfitting the synthetic distribution.

### 4.4 LoRA, in detail (this is the key part)

**Problem with full fine-tuning.** Updating all ~0.5B parameters means storing a
gradient and two AdamW moment buffers per parameter (so several bytes x 0.5B =
multiple GB of optimizer state), and you end up with a full copy of the model per
task. Overkill for adapting to one narrow task.

**LoRA (Low-Rank Adaptation).** Freeze the pretrained weight matrix W0 (shape
d x k). Do not update it. Represent the fine-tuning update as a **low-rank**
product:

    W_effective = W0 + dW,   dW = (alpha / r) * B @ A

where A is r x k, B is d x r, and the **rank r is tiny** (we use r = 16) compared
to d and k (hundreds to thousands). Only A and B are trainable. The forward pass
becomes:

    h = W0 @ x + (alpha / r) * B @ (A @ x)

**Why it works.** The weight update needed to adapt a big pretrained model to a
specific task has low "intrinsic rank" - a small-rank correction is enough. You
are not relearning language, just nudging behavior.

**Initialization.** A is initialized small-random (Gaussian), B is initialized to
**zero**, so dW = 0 at step 0 and training starts from exactly the pretrained
model. The adapters then learn the correction.

**The knobs:**
- `lora_r` (rank, 16): capacity of the adapter. Higher = more expressive, more
  params.
- `lora_alpha` (32): a scaling factor; the effective scale applied to dW is
  alpha/r (= 2 here). Think of it as the adapter's learning-rate gain.
- `lora_target_modules` (q_proj, k_proj, v_proj, o_proj): which weight matrices
  get an adapter. The attention projections are the standard choice; you can add
  the MLP projections for more capacity.
- `lora_dropout` (0.05): dropout on the adapter path, light regularization.

**Parameter and memory win.** Per adapted matrix, trainable params drop from
d*k to r*(d+k). For Qwen2.5-0.5B with adapters on the four attention projections
at r=16, you train on the order of a few million parameters (roughly 1% of the
model) instead of 490M. Gradients and AdamW moments exist only for those few
million, so it fits easily on a modest GPU, and the saved adapter is tens of MB,
not a gigabyte.

**Gradients with LoRA.** W0 has `requires_grad = False`, so backprop computes
gradients only into A and B. Everything else about the optimization (AdamW,
schedule, clipping) is unchanged, just applied to far fewer parameters.

**Merging for deployment (`04_export.py`).** At inference you do not want the
extra B@A matmul. `merge_and_unload()` folds the adapter back in:
W0 <- W0 + (alpha/r)*B@A, producing a standalone model identical in shape to the
base. That merged model is what we export to ONNX for the Rust `ort` backend.

**QLoRA vs LoRA.** QLoRA additionally quantizes the frozen base to 4-bit to save
even more memory. At 0.5B we do not need it; plain LoRA in bf16 fits comfortably,
and skipping 4-bit avoids a small quality hit.

---

## 5. Metrics

Training optimizes the cross-entropy loss above. To judge whether the fine-tune
is actually better than the base model, `03_evaluate.py` runs BOTH on the
held-out real test set and scores a suite that balances "did it edit correctly"
against "did it stay faithful":

- **chrF** (sacrebleu): character n-gram F-score of the output against the gold
  clean. General overlap/fluency signal, stable on short text.
- **disfluency-removal F1:** treat cleanup as deleting tokens from the raw. Gold
  deletions = tokens in raw not in gold; predicted deletions = tokens in raw not
  in output. F1 over those deleted multisets. Measures the core job directly.
- **added-content rate:** fraction of output content tokens NOT present in the
  raw input. Should be about 0. **This is the hallucination guard** - the metric
  that catches the model inventing or answering. A fine-tune that improves chrF
  but raises added-content is a regression, not a win.
- **source-overlap:** fraction of output tokens that are present in the raw.
  Should be near 1.

(Optional, heavier: ERRANT F0.5 via spacy for formal edit scoring; a
sentence-embedding cosine for semantic drift. Left as extras behind the `errant`
optional dependency.)

**The decisive behavioral test:** feed dictated questions ("um what's the capital
of france") and confirm the fine-tune **cleans** them ("What's the capital of
France?") rather than **answering**. This is the exact failure the base model
made, so it is the single most important check.

**Protocol:** held-out real test never seen in training, greedy decoding for
determinism, one table with rows {base, fine-tune} and the four columns, plus a
qualitative before/after on real transcripts. Win condition: higher disfluency
F1 and chrF with added-content held at about 0.

---

## 6. File-by-file guide

Infra (already written, the format, do not need rewriting):
- `pyproject.toml`, `.python-version`, `uv.lock` (generated by `uv sync`): the
  pinned, self-contained environment.
- `Makefile`: one make target per pipeline stage, RUN_ID / LR / EPOCHS settable.
- `configs/inject.yaml`: the injection recipe and the clean/eval data sources.
- `configs/train.yaml`: base model, LoRA knobs, optimizer, schedule, precision.
- `README.md`: quickstart and the Vast.ai steps.

Code to write (scaffolded with signatures + specs):
- `src/cleanup/config.py`: load the two yaml files into `TrainConfig` /
  `InjectConfig` dataclasses.
- `src/cleanup/prompts.py`: the `SYSTEM_PROMPT` and `build_messages` (a starting
  prompt is provided; tune it).
- `src/cleanup/inject.py`: `strip_punctuation_and_lowercase` and `make_raw` (the
  injection algorithm from section 3.2). Pure functions, unit-tested.
- `src/cleanup/data.py`: load clean sentences (hf stream or a local file), build
  pairs, split, load the real eval set, jsonl read/write.
- `src/cleanup/train.py`: `build_dataset` (chat-template the pairs) and `train`
  (LoRA + trl SFTTrainer, completion-only loss). Section 4 is the spec.
- `src/cleanup/infer.py`: `load_model` (base + optional adapter) and `clean_text`
  (greedy generate, output length capped near the input).
- `src/cleanup/evaluate.py`: the metric functions from section 5.
- `src/cleanup/export.py`: `merge_adapter` (fold LoRA in) and `export_onnx`.
- `src/cleanup/pack.py`: `render_report` and `pack_run` (tar + sha256).
- `scripts/01_data.py .. 06_pack_and_ship.py`: thin CLI entry points that wire
  the src functions together per stage. Each has its argparse and a step list.
- `tests/test_inject.py`: assert the injection invariants (the faithfulness one
  matters most).

---

## 7. Vast.ai workflow

1. rent a cuda pytorch instance, note the ssh host and port.
2. ssh in, clone the mumble repo, `cd models/cleanup`.
3. `uv sync` (generates `uv.lock` on first run; commit it).
4. `make all RUN_ID=r1` (or run stages one at a time and inspect between them).
5. `pack` prints a sha256 and an `scp -P <port> root@<host>:... .` line. pull the
   `dist/<run>.tar.gz` off the box, run `shasum -a 256` to verify, then destroy
   the instance.

`02_train.py` is cuda-aware (bf16 when the GPU supports it, else fp16, off on
CPU), so `make smoke` runs the same code on CPU locally with a few rows and one
epoch to validate wiring before you rent anything.

Do not launch a Vast.ai run until the code is written and the plan reviewed.
