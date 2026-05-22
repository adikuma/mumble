//! speech to text backend.
//!
//! on windows (default): uses `sherpa-rs` to run parakeet tdt v3 (english)
//! via onnx runtime with the directml execution provider. works on any gpu
//! vendor and falls back to cpu if none is available.
//!
//! on non windows hosts or when `mock-transcribe` is set: a stub
//! implementation so the crate still compiles and the frontend can be
//! smoke tested.

use anyhow::Result;
use std::path::PathBuf;

pub trait Transcriber: Send + Sync {
    fn transcribe(&self, samples_16k_mono: &[f32]) -> Result<String>;
    fn name(&self) -> &'static str {
        "Parakeet-TDT v3"
    }
}

pub fn load(model_dir: PathBuf) -> Result<Box<dyn Transcriber>> {
    #[cfg(all(windows, not(feature = "mock-transcribe")))]
    {
        ParakeetTranscriber::new(model_dir).map(|t| Box::new(t) as Box<dyn Transcriber>)
    }

    #[cfg(any(not(windows), feature = "mock-transcribe"))]
    {
        let _ = model_dir;
        Ok(Box::new(MockTranscriber))
    }
}

// real backend (windows + sherpa-onnx)

#[cfg(all(windows, not(feature = "mock-transcribe")))]
mod real {
    use super::*;
    use anyhow::Result;
    use parking_lot::Mutex;
    use sherpa_rs::transducer::{TransducerConfig, TransducerRecognizer};
    use std::path::PathBuf;

    pub struct ParakeetTranscriber {
        inner: Mutex<TransducerRecognizer>,
    }

    impl ParakeetTranscriber {
        pub fn new(model_dir: PathBuf) -> Result<Self> {
            let encoder = model_dir.join("encoder.onnx");
            let decoder = model_dir.join("decoder.onnx");
            let joiner = model_dir.join("joiner.onnx");
            let tokens = model_dir.join("tokens.txt");

            for p in [&encoder, &decoder, &joiner, &tokens] {
                if !p.exists() {
                    anyhow::bail!("missing model asset: {}", p.display());
                }
            }

            let config = TransducerConfig {
                encoder: encoder.to_string_lossy().to_string(),
                decoder: decoder.to_string_lossy().to_string(),
                joiner: joiner.to_string_lossy().to_string(),
                tokens: tokens.to_string_lossy().to_string(),
                sample_rate: 16_000,
                feature_dim: 80,
                model_type: "nemo_transducer".to_string(),
                ..Default::default()
            };

            let recognizer = TransducerRecognizer::new(config)
                .map_err(|e| anyhow::anyhow!("init sherpa-onnx: {e}"))?;
            Ok(Self {
                inner: Mutex::new(recognizer),
            })
        }
    }

    impl Transcriber for ParakeetTranscriber {
        fn transcribe(&self, samples: &[f32]) -> Result<String> {
            let mut rec = self.inner.lock();
            let duration_sec = samples.len() as f32 / 16_000.0;
            let started = std::time::Instant::now();
            tracing::info!(
                samples = samples.len(),
                duration_sec = format!("{duration_sec:.2}"),
                "transcribe: input"
            );
            let text = rec.transcribe(16_000, samples);
            let trimmed = text.trim().to_string();
            tracing::info!(
                ms = started.elapsed().as_millis() as u64,
                output_len = trimmed.len(),
                preview = trimmed.chars().take(80).collect::<String>(),
                "transcribe: output"
            );
            if trimmed.is_empty() && duration_sec > 0.5 {
                tracing::warn!(
                    duration_sec = format!("{duration_sec:.2}"),
                    "transcribe returned empty for non trivial audio. \
                     likely sherpa onnx silent failure (directml tensor limit?)"
                );
            }
            Ok(trimmed)
        }
    }
}

#[cfg(all(windows, not(feature = "mock-transcribe")))]
pub use real::ParakeetTranscriber;

// mock backend (non windows or explicit feature flag)

#[cfg(any(not(windows), feature = "mock-transcribe"))]
pub struct MockTranscriber;

#[cfg(any(not(windows), feature = "mock-transcribe"))]
impl Transcriber for MockTranscriber {
    fn transcribe(&self, samples: &[f32]) -> Result<String> {
        let duration = samples.len() as f32 / 16_000.0;
        Ok(format!(
            "[mock transcript: {:.1}s of audio captured]",
            duration
        ))
    }
    fn name(&self) -> &'static str {
        "Mock (no model)"
    }
}
