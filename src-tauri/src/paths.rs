use anyhow::{Context, Result};
use std::path::PathBuf;

/// roaming app data directory for mumble (settings.json, history.db).
///
/// windows: `%APPDATA%\Mumble`
/// macos:   `~/Library/Application Support/Mumble`
/// linux:   `~/.local/share/mumble` (dev only)
pub fn data_dir() -> Result<PathBuf> {
    let base = dirs::data_dir().context("no OS data dir")?;
    let dir = base.join("Mumble");
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    Ok(dir)
}

/// local (non roaming) app data directory for mumble. used for large
/// machine specific assets that should not roam with the user profile,
/// like the parakeet onnx model files.
///
/// windows: `%LOCALAPPDATA%\Mumble`
/// macos:   `~/Library/Application Support/Mumble` (no separate local dir)
/// linux:   `~/.local/share/mumble`
pub fn local_data_dir() -> Result<PathBuf> {
    let base = dirs::data_local_dir().context("no OS local data dir")?;
    let dir = base.join("Mumble");
    std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    Ok(dir)
}

pub fn settings_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("settings.json"))
}

pub fn history_db_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("history.db"))
}

pub fn models_dir() -> Result<PathBuf> {
    // model assets live in local app data so a multi gb download does not
    // roam with the user profile.
    let dir = local_data_dir()?.join("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// parakeet asr model assets. each model gets its own subfolder under
/// `models/` so the cleanup model never collides with parakeet's files.
pub fn parakeet_dir() -> Result<PathBuf> {
    let dir = models_dir()?.join("parakeet");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// optional cleanup model assets (fp32 onnx + tokenizer).
pub fn cleanup_dir() -> Result<PathBuf> {
    let dir = models_dir()?.join("cleanup");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
