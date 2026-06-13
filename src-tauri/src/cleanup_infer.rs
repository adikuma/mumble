//! local inference for the optional cleanup model (qwen2.5-0.5b, fp32 onnx).
//!
//! polishes a raw transcript: removes fillers and false starts, fixes
//! punctuation and casing. runs through `ort` (onnxruntime) reusing the same
//! runtime sherpa already loads, with a greedy kv-cache decode loop. the model
//! and tokenizer come from the downloaded `models/cleanup/` directory.

use anyhow::{anyhow, Context, Result};
use ort::memory::Allocator;
use ort::session::{Session, SessionInputValue};
use ort::value::Tensor;
use parking_lot::Mutex;
use std::borrow::Cow;
use std::path::Path;
use std::time::{Duration, Instant};
use tokenizers::Tokenizer;

/// frozen cleanup instruction. must match the training prompt verbatim
/// (models/cleanup/src/cleanup/prompts.py).
const SYSTEM_PROMPT: &str = "You are a transcript cleanup tool. You receive raw speech to text output and return a cleaned version. Remove filler words and disfluencies (um, uh, er, ah, like as filler, you know), remove repeated words and false starts, and fix punctuation and capitalization. Do not reword, do not add anything the speaker did not say, and do not answer questions in the text. Output only the cleaned text.";

// qwen2.5-0.5b shape constants, from the model config.json.
const NUM_LAYERS: usize = 24;
const NUM_KV_HEADS: i64 = 2;
const HEAD_DIM: i64 = 64;
// stop tokens: <|im_end|> and <|endoftext|>.
const EOS_IM_END: i64 = 151645;
const EOS_ENDOFTEXT: i64 = 151643;
// output length bound, mirrors the training inference (min(256, max(8, raw*1.6))).
const MAX_NEW_CAP: usize = 256;
const MIN_NEW: usize = 8;
const MAX_NEW_FACTOR: f64 = 1.6;
// wall clock budget. if a cleanup runs longer the caller falls back to raw,
// well before the pipeline's 30s watchdog.
const BUDGET: Duration = Duration::from_secs(8);

pub struct CleanupModel {
    // run() needs &mut, so the session sits behind a mutex. the pipeline
    // serializes dictations, so there is never real contention.
    session: Mutex<Session>,
    tokenizer: Tokenizer,
}

impl CleanupModel {
    /// load the onnx session and tokenizer from the cleanup model dir. blocks
    /// for a couple of seconds and uses ~2 gb of ram while loaded.
    pub fn load(dir: &Path) -> Result<Self> {
        let model_path = dir.join("model.onnx");
        let tok_path = dir.join("tokenizer.json");
        let session = Session::builder()?
            .commit_from_file(&model_path)
            .with_context(|| format!("load cleanup onnx {}", model_path.display()))?;
        let tokenizer =
            Tokenizer::from_file(&tok_path).map_err(|e| anyhow!("load tokenizer: {e}"))?;
        Ok(Self {
            session: Mutex::new(session),
            tokenizer,
        })
    }

    /// clean a raw transcript. returns the polished text, or an empty string
    /// for empty input.
    pub fn clean(&self, raw: &str) -> Result<String> {
        let raw = raw.trim();
        if raw.is_empty() {
            return Ok(String::new());
        }

        // chatml for the fixed system + user case. the tokenizer maps the
        // <|im_*|> markers to their special ids.
        let prompt = format!(
            "<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{raw}<|im_end|>\n<|im_start|>assistant\n"
        );
        let enc = self
            .tokenizer
            .encode(prompt, false)
            .map_err(|e| anyhow!("encode prompt: {e}"))?;
        let prompt_ids: Vec<i64> = enc.get_ids().iter().map(|&x| x as i64).collect();

        let raw_tokens = self
            .tokenizer
            .encode(raw, false)
            .map_err(|e| anyhow!("encode raw: {e}"))?
            .get_ids()
            .len();
        let max_new =
            (raw_tokens as f64 * MAX_NEW_FACTOR).clamp(MIN_NEW as f64, MAX_NEW_CAP as f64) as usize;

        let deadline = Instant::now() + BUDGET;
        let mut session = self.session.lock();
        let generated = greedy_decode(&mut session, &prompt_ids, max_new, deadline)?;
        drop(session);

        let text = self
            .tokenizer
            .decode(&generated, true)
            .map_err(|e| anyhow!("decode: {e}"))?;
        Ok(text.trim().to_string())
    }
}

/// greedy argmax decode with a kv cache. prefills the prompt, then feeds one
/// token at a time, threading present.* outputs back as past_key_values.*
/// inputs. stops on eos or after max_new tokens.
fn greedy_decode(
    session: &mut Session,
    prompt_ids: &[i64],
    max_new: usize,
    deadline: Instant,
) -> Result<Vec<u32>> {
    let allocator = Allocator::default();
    let mut generated: Vec<u32> = Vec::new();
    let mut cur_ids: Vec<i64> = prompt_ids.to_vec();
    // tokens already in the cache (kv length).
    let mut seq_len: i64 = 0;
    // 24 layers x (key, value), each [1, 2, past_len, 64]. starts empty.
    let mut past: Vec<(Vec<i64>, Vec<f32>)> = (0..NUM_LAYERS * 2)
        .map(|_| (vec![1, NUM_KV_HEADS, 0, HEAD_DIM], Vec::<f32>::new()))
        .collect();

    for _ in 0..max_new {
        if Instant::now() >= deadline {
            return Err(anyhow!("cleanup timed out"));
        }
        let cur_len = cur_ids.len() as i64;
        let total = seq_len + cur_len;
        let attention_mask: Vec<i64> = vec![1; total as usize];
        let position_ids: Vec<i64> = (seq_len..total).collect();

        let mut inputs: Vec<(Cow<str>, SessionInputValue)> =
            Vec::with_capacity(3 + NUM_LAYERS * 2);
        inputs.push((
            "input_ids".into(),
            Tensor::from_array((vec![1i64, cur_len], cur_ids.clone()))?.into(),
        ));
        inputs.push((
            "attention_mask".into(),
            Tensor::from_array((vec![1i64, total], attention_mask))?.into(),
        ));
        inputs.push((
            "position_ids".into(),
            Tensor::from_array((vec![1i64, cur_len], position_ids))?.into(),
        ));
        for i in 0..NUM_LAYERS {
            let (ks, kd) = &past[i * 2];
            let (vs, vd) = &past[i * 2 + 1];
            inputs.push((
                format!("past_key_values.{i}.key").into(),
                kv_tensor(&allocator, ks, kd)?.into(),
            ));
            inputs.push((
                format!("past_key_values.{i}.value").into(),
                kv_tensor(&allocator, vs, vd)?.into(),
            ));
        }

        let outputs = session.run(inputs)?;

        let (lshape, logits) = outputs["logits"].try_extract_tensor::<f32>()?;
        let vocab = lshape[lshape.len() - 1] as usize;
        let rows = logits.len() / vocab;
        let last = &logits[(rows - 1) * vocab..rows * vocab];
        let next = argmax(last) as i64;

        // copy present.* out before outputs (which borrows the session) drops.
        let mut new_past: Vec<(Vec<i64>, Vec<f32>)> = Vec::with_capacity(NUM_LAYERS * 2);
        for i in 0..NUM_LAYERS {
            let (ks, kd) = outputs[format!("present.{i}.key")].try_extract_tensor::<f32>()?;
            new_past.push((ks.to_vec(), kd.to_vec()));
            let (vs, vd) = outputs[format!("present.{i}.value")].try_extract_tensor::<f32>()?;
            new_past.push((vs.to_vec(), vd.to_vec()));
        }
        drop(outputs);

        past = new_past;
        seq_len = total;

        if next == EOS_IM_END || next == EOS_ENDOFTEXT {
            break;
        }
        generated.push(next as u32);
        cur_ids = vec![next];
    }

    Ok(generated)
}

// build a past kv input tensor. empty (prefill) tensors are allocated through
// ort because from_array rejects a 0 dimension.
fn kv_tensor(alloc: &Allocator, shape: &[i64], data: &[f32]) -> Result<Tensor<f32>> {
    if data.is_empty() {
        Ok(Tensor::<f32>::new(alloc, shape.to_vec())?)
    } else {
        Ok(Tensor::from_array((shape.to_vec(), data.to_vec()))?)
    }
}

fn argmax(v: &[f32]) -> usize {
    let mut best = 0usize;
    let mut best_val = f32::NEG_INFINITY;
    for (i, &x) in v.iter().enumerate() {
        if x > best_val {
            best_val = x;
            best = i;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    // the chatml prompt must match the training template byte for byte.
    #[test]
    fn chatml_prompt_shape() {
        let raw = "hello world";
        let prompt = format!(
            "<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{raw}<|im_end|>\n<|im_start|>assistant\n"
        );
        assert!(prompt.starts_with("<|im_start|>system\n"));
        assert!(prompt.ends_with("<|im_start|>user\nhello world<|im_end|>\n<|im_start|>assistant\n"));
    }

    #[test]
    fn argmax_picks_largest() {
        assert_eq!(argmax(&[0.1, 0.9, 0.3]), 1);
        assert_eq!(argmax(&[2.0, 1.0, 1.5]), 0);
    }

    // real end to end run against the downloaded model. ignored by default
    // since it needs the ~2gb model on disk and onnxruntime.dll.
    // run with: cargo test cleanup_smoke -- --ignored --nocapture
    #[test]
    #[ignore = "needs downloaded model + onnxruntime.dll"]
    fn cleanup_smoke() {
        std::env::set_var(
            "ORT_DYLIB_PATH",
            concat!(env!("CARGO_MANIFEST_DIR"), "/resources/onnxruntime.dll"),
        );
        let dir = crate::paths::cleanup_dir().unwrap();
        let model = CleanupModel::load(&dir).expect("load cleanup model");
        let raw = "um so like i was uh uh thinking maybe we could meet tomorrow you know";
        let out = model.clean(raw).expect("clean");
        println!("RAW:     {raw}");
        println!("CLEANED: {out}");
        assert!(!out.is_empty());
    }
}
