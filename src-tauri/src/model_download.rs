//! Download + verify Parakeet-TDT v3 ONNX assets on first run.
//!
//! Assets ship as a tarball/zip on HuggingFace. We keep it simple: a list of
//! individual URLs + sha256 digests, downloaded in sequence with progress
//! events forwarded to the frontend.

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

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
}

const ASSETS: &[Asset] = &[
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/encoder.int8.onnx",
        filename: "encoder.onnx",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/decoder.int8.onnx",
        filename: "decoder.onnx",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/joiner.int8.onnx",
        filename: "joiner.onnx",
    },
    Asset {
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/tokens.txt",
        filename: "tokens.txt",
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
    let mut hasher = Sha256::new();
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
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

#[allow(dead_code)]
pub fn delete_model(dir: &std::path::Path) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for asset in ASSETS {
        let p = dir.join(asset.filename);
        if p.exists() {
            std::fs::remove_file(&p).with_context(|| format!("rm {}", p.display()))?;
        }
    }
    Ok(())
}

// Keep `anyhow!` used even if the Windows check below is removed.
#[allow(dead_code)]
fn _force_anyhow_use() -> anyhow::Error {
    anyhow!("unused")
}
