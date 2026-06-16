//! download the parakeet tdt v3 onnx assets from huggingface on first run.
//!
//! hex's equivalent (`Hex/Clients/ParakeetClipPreparer.swift` in the cloned
//! reference) similarly relies on plain https to fetch the model. the actual
//! streaming, verification, and progress logic lives in `download.rs`; this
//! module only pins the parakeet asset set and the directory it lands in.

use anyhow::{Context, Result};
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

/// re fetch the parakeet model without bricking the working copy on failure.
///
/// downloads into a sibling staging directory and only swaps it over the live
/// model once every asset has been fetched and verified. if the download dies
/// partway the existing model is untouched, so a flaky network never leaves the
/// app with no usable asr model.
pub async fn refetch_model(app: &AppHandle, dir: &Path) -> Result<()> {
    let staging = staging_dir(dir);
    // start from a clean staging area so a half written previous attempt does
    // not get mistaken for a complete download.
    if staging.exists() {
        std::fs::remove_dir_all(&staging)
            .with_context(|| format!("clear staging {}", staging.display()))?;
    }
    std::fs::create_dir_all(&staging)
        .with_context(|| format!("create staging {}", staging.display()))?;

    // download and verify into staging. on any error bail without touching the
    // live model, then best effort clean the staging area.
    if let Err(e) =
        download::download_assets(app, &staging, ASSETS, "mumble://download-progress", 0, None)
            .await
    {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }

    // sanity check before destroying the working copy.
    if !model_is_present(&staging) {
        let _ = std::fs::remove_dir_all(&staging);
        anyhow::bail!("staged parakeet download incomplete after verify");
    }

    // swap: drop the old model only now that the new one is verified on disk,
    // then move each verified asset into place. delete_model is best effort so
    // a locked old file does not block the swap.
    let _ = delete_model(dir);
    std::fs::create_dir_all(dir).with_context(|| format!("create {}", dir.display()))?;
    for asset in ASSETS {
        let from = staging.join(asset.filename);
        let to = dir.join(asset.filename);
        std::fs::rename(&from, &to)
            .with_context(|| format!("swap {} into place", asset.filename))?;
    }
    let _ = std::fs::remove_dir_all(&staging);
    Ok(())
}

/// sibling staging directory for an atomic style model swap. lives next to the
/// live model dir so the rename stays on the same volume.
fn staging_dir(dir: &Path) -> std::path::PathBuf {
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "parakeet".to_string());
    match dir.parent() {
        Some(parent) => parent.join(format!("{name}.staging")),
        None => std::path::PathBuf::from(format!("{name}.staging")),
    }
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
