use anyhow::{Context, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::paths;

/// user facing settings persisted to `%APPDATA%\Mumble\settings.json`.
///
/// the default hotkey is `RightAlt` (every laptop has it. no right ctrl on
/// 14 inch keyboards). pre roll defaults to 0 ms (zero buffer). capture is
/// always live so recording starts the instant the key goes down, and the
/// indicator shows a speak now cue, so the look back buffer stays off by
/// default. raise it in settings if you tend to talk before the cue. auto
/// paste defaults to ON. the only way to
/// flip it is from the in app settings, behavior toggle.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub input_device: Option<String>,
    pub launch_at_login: bool,
    pub start_minimized: bool,
    pub theme: String,
    pub paused: bool,

    /// milliseconds of audio prepended on hotkey press (the warm ring buffer
    /// look back window). 0 disables pre roll and is the default.
    #[serde(default = "default_preroll_ms")]
    pub pre_roll_ms: u32,

    /// when true, transcription pastes at the cursor via simulated `Ctrl+V`
    /// and restores the prior clipboard. when false, the transcript is left
    /// in the clipboard and the user pastes manually.
    #[serde(default = "default_auto_paste")]
    pub auto_paste: bool,
}

fn default_preroll_ms() -> u32 {
    0
}
fn default_auto_paste() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: "RightAlt".into(),
            input_device: None,
            launch_at_login: false,
            start_minimized: false,
            theme: "system".into(),
            paused: false,
            pre_roll_ms: default_preroll_ms(),
            auto_paste: default_auto_paste(),
        }
    }
}

#[derive(Clone)]
pub struct SettingsStore {
    inner: Arc<RwLock<Settings>>,
}

impl SettingsStore {
    pub fn load() -> Self {
        let settings = Self::read_from_disk().unwrap_or_default();
        Self {
            inner: Arc::new(RwLock::new(settings)),
        }
    }

    fn read_from_disk() -> Result<Settings> {
        let path = paths::settings_path()?;
        if !path.exists() {
            return Ok(Settings::default());
        }
        let s =
            std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        Ok(serde_json::from_str(&s)?)
    }

    pub fn get(&self) -> Settings {
        self.inner.read().clone()
    }

    pub fn update<F: FnOnce(&mut Settings)>(&self, f: F) -> Result<Settings> {
        let mut guard = self.inner.write();
        f(&mut guard);
        let snapshot = guard.clone();
        drop(guard);
        self.persist(&snapshot)?;
        Ok(snapshot)
    }

    fn persist(&self, s: &Settings) -> Result<()> {
        let path = paths::settings_path()?;
        let json = serde_json::to_string_pretty(s)?;
        std::fs::write(&path, json).with_context(|| format!("write {}", path.display()))?;
        Ok(())
    }
}
