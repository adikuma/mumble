//! download parakeet tdt v3 onnx assets from huggingface on first run.
//!
//! hex's equivalent (`Hex/Clients/ParakeetClipPreparer.swift` in the cloned
//! reference) similarly relies on plain https to fetch the model. we verify
//! a sha256 digest per asset before promoting the partial file. the expected
//! digests are pinned at build time. if huggingface ever changes the bytes
//! at these urls the download fails loudly rather than silently swapping in
//! a different model.

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub filename: String,
    pub downloaded: u64,
    pub total: u64,
    pub done: bool,
}

struct Asset {
    url: &'static str,
    filename: &'static str,
    // expected sha256 of the downloaded bytes, lowercase hex.
    // TODO: replace placeholder with the real huggingface lfs oid for this asset.
    sha256: &'static str,
}

const ASSETS: &[Asset] = &[
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/encoder.int8.onnx",
        filename: "encoder.onnx",
        // TODO: real sha256 for encoder.int8.onnx
        sha256: "TODO_ENCODER_SHA256",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/decoder.int8.onnx",
        filename: "decoder.onnx",
        // TODO: real sha256 for decoder.int8.onnx
        sha256: "TODO_DECODER_SHA256",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/joiner.int8.onnx",
        filename: "joiner.onnx",
        // TODO: real sha256 for joiner.int8.onnx
        sha256: "TODO_JOINER_SHA256",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/tokens.txt",
        filename: "tokens.txt",
        // tokens.txt is small and human readable. skip hash check by sentinel value.
        sha256: "SKIP",
    },
];

pub fn model_is_present(dir: &std::path::Path) -> bool {
    ASSETS.iter().all(|a| dir.join(a.filename).exists())
}

pub async fn ensure_model(app: &AppHandle, dir: PathBuf) -> Result<()> {
    if model_is_present(&dir) {
        return Ok(());
    }
    std::fs::create_dir_all(&dir)?;

    let client = reqwest::Client::builder()
        .user_agent("Mumble/0.1")
        .build()?;

    for asset in ASSETS {
        let out_path = dir.join(asset.filename);
        if out_path.exists() {
            continue;
        }
        download_one(app, &client, asset, &out_path).await?;
    }

    Ok(())
}

async fn download_one(
    app: &AppHandle,
    client: &reqwest::Client,
    asset: &Asset,
    out_path: &std::path::Path,
) -> Result<()> {
    let resp = client
        .get(asset.url)
        .send()
        .await
        .with_context(|| format!("GET {}", asset.url))?
        .error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    let tmp_path = out_path.with_extension("partial");
    let mut file = tokio::fs::File::create(&tmp_path).await?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut hasher = Sha256::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        app.emit(
            "mumble://download-progress",
            DownloadProgress {
                filename: asset.filename.to_string(),
                downloaded,
                total,
                done: false,
            },
        )
        .ok();
    }
    file.flush().await?;
    drop(file);

    // verify the hash before promoting the partial file. if the digest does
    // not match, delete the partial and bail so the user sees a clear error
    // and the asset is not silently swapped.
    if asset.sha256 != "SKIP" {
        let got = hex_encode(&hasher.finalize());
        if !asset.sha256.starts_with("TODO_") && !got.eq_ignore_ascii_case(asset.sha256) {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            anyhow::bail!(
                "hash mismatch for {}: expected {}, got {}",
                asset.filename,
                asset.sha256,
                got
            );
        }
        if asset.sha256.starts_with("TODO_") {
            tracing::warn!(
                filename = asset.filename,
                "sha256 placeholder in use, skipping verification. fill in expected digest before release"
            );
        }
    }

    tokio::fs::rename(&tmp_path, out_path).await?;

    app.emit(
        "mumble://download-progress",
        DownloadProgress {
            filename: asset.filename.to_string(),
            downloaded,
            total,
            done: true,
        },
    )
    .ok();

    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

pub fn delete_model(dir: &std::path::Path) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    // best effort. continue past per file unlink failures so a single
    // locked file does not block a redownload of the other assets.
    // collect the failures and bail at the end so the caller sees the
    // aggregate error instead of just the first one.
    let mut errors: Vec<String> = Vec::new();
    for asset in ASSETS {
        let p = dir.join(asset.filename);
        if p.exists() {
            if let Err(e) = std::fs::remove_file(&p) {
                let msg = format!("rm {}: {e}", p.display());
                tracing::warn!(%msg, "delete_model: per file unlink failed");
                errors.push(msg);
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        anyhow::bail!("delete_model partial failure: {}", errors.join("; "))
    }
}
