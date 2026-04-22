use anyhow::{Context, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::paths;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub input_device: Option<String>,
    pub launch_at_login: bool,
    pub start_minimized: bool,
    pub theme: String,
    pub paused: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: "RightCtrl".into(),
            input_device: None,
            launch_at_login: false,
            start_minimized: false,
            theme: "system".into(),
            paused: false,
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
