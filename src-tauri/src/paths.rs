use anyhow::{Context, Result};
use std::path::PathBuf;

/// root directory for mumble's persistent data (settings.json, history.db, models/).
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

pub fn settings_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("settings.json"))
}

pub fn history_db_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("history.db"))
}

pub fn models_dir() -> Result<PathBuf> {
    let dir = data_dir()?.join("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
