//! download the parakeet tdt v3 onnx assets from huggingface on first run.
//!
//! hex's equivalent (`Hex/Clients/ParakeetClipPreparer.swift` in the cloned
//! reference) similarly relies on plain https to fetch the model. the actual
//! streaming, verification, and progress logic lives in `download.rs`; this
//! module only pins the parakeet asset set and the directory it lands in.

use anyhow::Result;
use std::path::Path;
use tauri::AppHandle;

use crate::download::{self, Asset};

/// parakeet asset set. expected sha256 digests are pinned at build time so a
/// changed upstream file fails loudly rather than silently swapping the model.
const ASSETS: &[Asset] = &[
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/encoder.int8.onnx",
        filename: "encoder.onnx",
        sha256: "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/decoder.int8.onnx",
        filename: "decoder.onnx",
        sha256: "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/joiner.int8.onnx",
        filename: "joiner.onnx",
        sha256: "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/tokens.txt",
        filename: "tokens.txt",
        // tokens.txt is small and human readable. skip hash check by sentinel.
        sha256: "SKIP",
    },
];

/// the human readable model name surfaced in the settings ui.
pub const PARAKEET_NAME: &str = "Parakeet-TDT v3 (English, int8)";

/// flat file names a pre subfolder install left at the root of `models/`.
/// these are deleted on startup so the only on disk layout is the per model
/// subfolder one.
const LEGACY_ROOT_FILES: &[&str] = &["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"];

pub fn model_is_present(dir: &Path) -> bool {
    download::assets_present(dir, ASSETS)
}

pub async fn ensure_model(app: &AppHandle, dir: std::path::PathBuf) -> Result<()> {
    if model_is_present(&dir) {
        return Ok(());
    }
    // parakeet has no cancel button (it is required for the app to work) and
    // no aggregate bar, so pass 0/None for those.
    download::download_assets(app, &dir, ASSETS, "mumble://download-progress", 0, None).await
}

pub fn delete_model(dir: &Path) -> Result<()> {
    download::delete_assets(dir, ASSETS)
}

/// delete any parakeet assets left at the root of the models directory by a
/// pre subfolder build. idempotent: a clean install finds nothing to remove.
pub fn purge_legacy_root_assets(models_root: &Path) -> Result<()> {
    let mut removed = 0;
    for name in LEGACY_ROOT_FILES {
        let path = models_root.join(name);
        if path.exists() {
            std::fs::remove_file(&path)?;
            removed += 1;
        }
    }
    if removed > 0 {
        tracing::info!(
            removed,
            "purged legacy root parakeet assets, will redownload into parakeet/"
        );
    }
    Ok(())
}
