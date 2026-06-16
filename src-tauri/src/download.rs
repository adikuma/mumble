//! shared model download primitives used by both the parakeet asr model and
//! the optional cleanup model.
//!
//! every asset is streamed to a sibling `.partial` file, hashed as the bytes
//! arrive, and only renamed over the final path once the sha256 matches the
//! pinned digest. this is the same verify before promote discipline the
//! original parakeet downloader used, lifted here so both models share it.
//!
//! progress is emitted per file and in aggregate so a caller rendering a
//! single "540 MB / 1.98 GB" bar does not have to sum events itself.

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fmt::Write as FmtWrite;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// one downloadable file. `filename` is a flat name written directly under the
/// model directory. `sha256` is the expected lowercase hex digest. the
/// sentinel `"SKIP"` disables verification for small human readable assets.
pub struct Asset {
    pub url: &'static str,
    pub filename: &'static str,
    pub sha256: &'static str,
}

/// cooperative cancellation shared between the command that starts a download
/// and the command that cancels it. checked between byte chunks.
#[derive(Clone, Default)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

/// tracks the single in flight download a model may have so a separate cancel
/// command can reach its `CancelFlag`. managed as tauri state.
#[derive(Clone, Default)]
pub struct ActiveDownload(Arc<parking_lot::Mutex<Option<CancelFlag>>>);

impl ActiveDownload {
    /// atomically claim the download slot. returns a fresh cancel flag, or
    /// None if a download is already in flight. doing the check and the set
    /// under one lock closes the race where two callers both pass a separate
    /// is_active check and start concurrent downloads into the same files.
    pub fn try_begin(&self) -> Option<CancelFlag> {
        let mut guard = self.0.lock();
        if guard.is_some() {
            return None;
        }
        let flag = CancelFlag::new();
        *guard = Some(flag.clone());
        Some(flag)
    }

    /// signal the in flight download (if any) to stop.
    pub fn cancel(&self) {
        if let Some(flag) = self.0.lock().as_ref() {
            flag.cancel();
        }
    }

    /// clear the handle once a download finishes or aborts.
    pub fn clear(&self) {
        *self.0.lock() = None;
    }
}

/// per file plus aggregate progress. emitted under a caller chosen event name
/// so parakeet and cleanup downloads land on separate channels.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub filename: String,
    pub downloaded: u64,
    pub total: u64,
    pub aggregate_downloaded: u64,
    pub aggregate_total: u64,
    pub done: bool,
}

/// true when every asset's final file already exists on disk.
pub fn assets_present(dir: &Path, assets: &[Asset]) -> bool {
    assets.iter().all(|a| dir.join(a.filename).exists())
}

/// best effort removal of every asset's final and partial files. collects per
/// file failures and reports the aggregate so one locked file does not mask the
/// rest.
pub fn delete_assets(dir: &Path, assets: &[Asset]) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    let mut errors: Vec<String> = Vec::new();
    for asset in assets {
        // partial_path uses with_extension, which for a name like
        // model.onnx_data yields model.partial. cover the {name}.partial form
        // too so neither naming leaves an orphan behind.
        for path in [
            dir.join(asset.filename),
            partial_path(dir, asset),
            dir.join(format!("{}.partial", asset.filename)),
        ] {
            if path.exists() {
                if let Err(e) = std::fs::remove_file(&path) {
                    let msg = format!("rm {}: {e}", path.display());
                    tracing::warn!(%msg, "delete_assets: per file unlink failed");
                    errors.push(msg);
                }
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        anyhow::bail!("delete_assets partial failure: {}", errors.join("; "))
    }
}

/// download every missing asset into `dir`, verifying each before promotion.
///
/// already present final files are skipped and counted toward the aggregate so
/// a retry only fetches what is missing. `aggregate_total` is the known sum of
/// all asset sizes for the progress bar (pass 0 if unknown). `cancel`, when
/// supplied, aborts between chunks and leaves no partial behind.
pub async fn download_assets(
    app: &AppHandle,
    dir: &Path,
    assets: &[Asset],
    event_name: &'static str,
    aggregate_total: u64,
    cancel: Option<CancelFlag>,
) -> Result<()> {
    std::fs::create_dir_all(dir).with_context(|| format!("create {}", dir.display()))?;

    let client = reqwest::Client::builder()
        .user_agent("Mumble/0.1")
        .build()?;

    // bytes already on disk count toward the bar: both fully fetched final
    // files and any leftover .partial files from an interrupted run that we
    // are about to resume.
    let mut aggregate_downloaded: u64 = assets
        .iter()
        .map(|a| {
            let final_len = std::fs::metadata(dir.join(a.filename))
                .map(|m| m.len())
                .unwrap_or(0);
            let partial_len = std::fs::metadata(partial_path(dir, a))
                .map(|m| m.len())
                .unwrap_or(0);
            final_len + partial_len
        })
        .sum();

    for asset in assets {
        let out_path = dir.join(asset.filename);
        if out_path.exists() {
            continue;
        }
        // bytes from a leftover .partial for this asset are already folded into
        // aggregate_downloaded above. subtract them so the base we hand to
        // download_one excludes this asset, then add back the final written
        // size once it returns. that keeps the bar monotonic across a resume.
        let resumed = std::fs::metadata(partial_path(dir, asset))
            .map(|m| m.len())
            .unwrap_or(0);
        let aggregate_base = aggregate_downloaded.saturating_sub(resumed);
        let written = download_one(
            app,
            &client,
            asset,
            &out_path,
            event_name,
            aggregate_base,
            aggregate_total,
            cancel.as_ref(),
        )
        .await?;
        aggregate_downloaded = aggregate_base + written;
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_one(
    app: &AppHandle,
    client: &reqwest::Client,
    asset: &Asset,
    out_path: &Path,
    event_name: &'static str,
    aggregate_base: u64,
    aggregate_total: u64,
    cancel: Option<&CancelFlag>,
) -> Result<u64> {
    let tmp_path = out_path.with_extension("partial");

    // resume from a leftover .partial if one survived an interrupted run. we
    // ask the server for the rest of the file via a Range header and re seed
    // the hasher with the existing bytes so the final digest still covers the
    // whole file. a 0 length partial is treated as a fresh download.
    let mut resume_from = std::fs::metadata(&tmp_path).map(|m| m.len()).unwrap_or(0);
    let mut hasher = Sha256::new();
    if resume_from > 0 {
        reseed_hasher(&tmp_path, &mut hasher)
            .await
            .with_context(|| format!("reseed hasher from {}", tmp_path.display()))?;
    }

    let mut request = client.get(asset.url);
    if resume_from > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={resume_from}-"));
    }
    let resp = request
        .send()
        .await
        .with_context(|| format!("GET {}", asset.url))?
        .error_for_status()?;

    // the server may ignore our Range and send the whole file (200). in that
    // case fall back to a clean restart: drop the resumed state, truncate, and
    // hash from zero. a 206 means the range was honoured and we append.
    let resuming = resume_from > 0 && resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if resume_from > 0 && !resuming {
        tracing::info!(
            file = asset.filename,
            "server did not honour Range, restarting download from scratch"
        );
        resume_from = 0;
        hasher = Sha256::new();
    }

    // content_length on a 206 is just the remaining bytes, so add back what we
    // already have to report the true total size.
    let total = resp.content_length().unwrap_or(0) + resume_from;

    let mut file = if resuming {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&tmp_path)
            .await?
    } else {
        tokio::fs::File::create(&tmp_path).await?
    };

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = resume_from;
    let mut last_emit: u64 = resume_from;

    while let Some(chunk) = stream.next().await {
        if let Some(flag) = cancel {
            if flag.is_cancelled() {
                // an explicit cancel is the one case where we discard the
                // partial. the user asked to stop, not to pause.
                drop(file);
                let _ = tokio::fs::remove_file(&tmp_path).await;
                anyhow::bail!("download cancelled");
            }
        }
        // on a transport error keep the .partial on disk so the next attempt
        // can resume instead of refetching from zero.
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        // throttle to ~1 MB steps. reqwest yields 8 to 64 KB chunks, so a
        // per chunk emit would fire hundreds of thousands of ipc events for a
        // 2 GB model. the final done=true event below always fires.
        if downloaded - last_emit >= 1_000_000 {
            last_emit = downloaded;
            app.emit(
                event_name,
                DownloadProgress {
                    filename: asset.filename.to_string(),
                    downloaded,
                    total,
                    aggregate_downloaded: aggregate_base + downloaded,
                    aggregate_total,
                    done: false,
                },
            )
            .ok();
        }
    }
    file.flush().await?;
    drop(file);

    // verify the digest before promoting the partial file. a mismatch deletes
    // the partial and bails so a corrupt or swapped asset never gets used. the
    // partial is removed here (not kept) because resuming a corrupt file would
    // never converge.
    if asset.sha256 != "SKIP" {
        let got = hex_encode(&hasher.finalize());
        if !got.eq_ignore_ascii_case(asset.sha256) {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            anyhow::bail!(
                "hash mismatch for {}: expected {}, got {}",
                asset.filename,
                asset.sha256,
                got
            );
        }
    }

    tokio::fs::rename(&tmp_path, out_path).await?;

    app.emit(
        event_name,
        DownloadProgress {
            filename: asset.filename.to_string(),
            downloaded,
            total,
            aggregate_downloaded: aggregate_base + downloaded,
            aggregate_total,
            done: true,
        },
    )
    .ok();

    Ok(downloaded)
}

/// sibling .partial path for an asset's final file.
fn partial_path(dir: &Path, asset: &Asset) -> std::path::PathBuf {
    dir.join(asset.filename).with_extension("partial")
}

/// feed the existing .partial bytes through the hasher so a resumed download
/// still finalizes the digest of the whole file. reads in fixed buffers so a
/// 2 gb partial does not balloon memory.
async fn reseed_hasher(path: &Path, hasher: &mut Sha256) -> Result<()> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        // write! into the buffer avoids the per byte format! heap allocation.
        let _ = write!(out, "{b:02x}");
    }
    out
}
