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
/// default. raise it in settings if you tend to talk before the cue.
///
/// `cleanup_enabled` records whether the user has opted into the cleanup
/// model. it defaults off and is only meaningful once the model is downloaded;
/// inference wiring lands in a later iteration.
///
/// note: an older `auto_paste` field was removed. paste at cursor is now the
/// fixed runtime behavior (see `pipeline::AUTO_PASTE`). old settings.json files
/// that still carry `auto_paste` load fine, serde ignores the unknown field.
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

    /// whether the user has opted into the optional cleanup model. defaults
    /// off. load bearing once inference is wired.
    #[serde(default)]
    pub cleanup_enabled: bool,
}

fn default_preroll_ms() -> u32 {
    0
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
            cleanup_enabled: false,
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
        // atomic write. dump the new json to a sibling tmp file, then rename
        // over the destination. on windows this is durable so a crash mid
        // write cannot leave settings.json half written.
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).with_context(|| format!("write {}", tmp.display()))?;
        std::fs::rename(&tmp, &path)
            .with_context(|| format!("rename {} to {}", tmp.display(), path.display()))?;
        Ok(())
    }
}
