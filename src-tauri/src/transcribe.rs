//! Speech-to-text backend.
//!
//! On Windows (default): uses `sherpa-rs` to run Parakeet-TDT v3 (English)
//! via ONNX Runtime with the DirectML execution provider — works on any GPU
//! vendor and falls back to CPU if none is available.
//!
//! On non-Windows hosts or when `mock-transcribe` is set: a stub implementation
//! so the crate still compiles and the frontend can be smoke-tested.

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
        return ParakeetTranscriber::new(model_dir).map(|t| Box::new(t) as Box<dyn Transcriber>);
    }

    #[cfg(any(not(windows), feature = "mock-transcribe"))]
    {
        let _ = model_dir;
        return Ok(Box::new(MockTranscriber));
    }
}

// ---------------------------------------------------------------------------
// Real backend (Windows + sherpa-onnx)
// ---------------------------------------------------------------------------

#[cfg(all(windows, not(feature = "mock-transcribe")))]
mod real {
    use super::*;
    use anyhow::{Context, Result};
    use parking_lot::Mutex;
    use sherpa_rs::nemo_parakeet::NemoParakeetConfig;
    use sherpa_rs::offline_recognizer::{OfflineRecognizer, OfflineRecognizerConfig};
    use std::path::PathBuf;

    pub struct ParakeetTranscriber {
        inner: Mutex<OfflineRecognizer>,
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

            let config = OfflineRecognizerConfig {
                nemo_parakeet: Some(NemoParakeetConfig {
                    encoder: encoder.to_string_lossy().to_string(),
                    decoder: decoder.to_string_lossy().to_string(),
                    joiner: joiner.to_string_lossy().to_string(),
                    tokens: tokens.to_string_lossy().to_string(),
                    ..Default::default()
                }),
                sample_rate: 16_000,
                feature_dim: 80,
                ..Default::default()
            };

            let recognizer = OfflineRecognizer::new(&config).context("init sherpa-onnx")?;
            Ok(Self {
                inner: Mutex::new(recognizer),
            })
        }
    }

    impl Transcriber for ParakeetTranscriber {
        fn transcribe(&self, samples: &[f32]) -> Result<String> {
            let mut rec = self.inner.lock();
            let text = rec.transcribe(16_000, samples)?;
            Ok(text.trim().to_string())
        }
    }
}

#[cfg(all(windows, not(feature = "mock-transcribe")))]
pub use real::ParakeetTranscriber;

// ---------------------------------------------------------------------------
// Mock backend (non-Windows or explicit feature flag)
// ---------------------------------------------------------------------------

pub struct MockTranscriber;

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
