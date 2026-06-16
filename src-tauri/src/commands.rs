//! all `#[tauri::command]` handlers the frontend can invoke.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use tauri_plugin_opener::OpenerExt;

use crate::audio;
use crate::cleanup_model;
use crate::dictionary::{Correction, DictEntry};
use crate::download::ActiveDownload;
use crate::history::{HistoryStore, InsightsData, Transcript};
use crate::hotkey::{CaptureError, HotkeyListener};
use crate::model_download;
use crate::pipeline::Pipeline;
use crate::settings::{Settings, SettingsStore};

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

// caps for user supplied strings. these protect the backend from
// pathological inputs (e.g. a paste of a multi mb script into the dictionary
// pattern field) without affecting typical usage.
const TRANSCRIPT_MAX_BYTES: usize = 1_048_576;
const DICT_FIELD_MAX_BYTES: usize = 1_024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
}

/// read the current `Settings` snapshot. side effect free. matches no emit.
#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Settings {
    store.get()
}

/// strongly typed partial settings patch from the frontend. unknown fields
/// are rejected so a typo cannot silently drop a field on the floor.
///
/// `input_device` uses double Option semantics: outer None means "field
/// absent, do not touch", `Some(None)` means "explicitly null, clear the
/// device override" and `Some(Some(...))` means "set to this device name".
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub hotkey: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_optional_string")]
    pub input_device: Option<Option<String>>,
    pub launch_at_login: Option<bool>,
    pub start_minimized: Option<bool>,
    pub theme: Option<String>,
    pub paused: Option<bool>,
    pub pre_roll_ms: Option<u32>,
    pub cleanup_enabled: Option<bool>,
}

// distinguish "absent" from "explicitly null" so the patch can both leave
// input_device alone and reset it. without this, serde collapses both into
// outer None and we lose the ability to clear an override.
fn deserialize_optional_optional_string<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

/// apply a partial `SettingsPatch` and return the merged `Settings`. side
/// effects: persists settings.json, reconciles autostart with the os, rebinds
/// the hotkey listener, and tears down the capture worker on input device
/// change. tray broadcasts a `mumble://settings-changed` event after persist.
#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    pipeline: State<'_, Arc<Pipeline>>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    // validate pre roll against the ring buffer ceiling so the frontend
    // cannot ask for a value the capture worker silently clamps.
    if let Some(v) = patch.pre_roll_ms {
        let max_ms = (audio::RING_SECONDS * 1000.0) as u32;
        if v > max_ms {
            return Err(format!(
                "preRollMs {v} exceeds ring buffer ceiling of {max_ms} ms"
            ));
        }
    }

    let prev = store.get();
    let next = store
        .update(|s| {
            if let Some(v) = patch.hotkey {
                s.hotkey = v;
            }
            if let Some(v) = patch.input_device {
                s.input_device = v;
            }
            if let Some(v) = patch.launch_at_login {
                s.launch_at_login = v;
            }
            if let Some(v) = patch.start_minimized {
                s.start_minimized = v;
            }
            if let Some(v) = patch.theme {
                s.theme = v;
            }
            if let Some(v) = patch.paused {
                s.paused = v;
            }
            if let Some(v) = patch.pre_roll_ms {
                s.pre_roll_ms = v;
            }
            if let Some(v) = patch.cleanup_enabled {
                s.cleanup_enabled = v;
            }
        })
        .map_err(err)?;

    // reconcile autostart with the os if the toggle changed. if the os refuses
    // the registration, roll the persisted setting back so disk, os, and ui all
    // agree, then surface the error to the user instead of swallowing it.
    if prev.launch_at_login != next.launch_at_login {
        let manager = app.autolaunch();
        let result = if next.launch_at_login {
            manager.enable()
        } else {
            manager.disable()
        };
        if let Err(e) = result {
            tracing::warn!(?e, "autostart toggle failed, rolling back");
            // best effort revert so the persisted value matches what the os
            // actually accepted. the ui then stays in sync via the error path.
            let _ = store.update(|s| s.launch_at_login = prev.launch_at_login);
            return Err(format!("couldn't update launch at login: {e}"));
        }
    }

    // live rebind the hotkey listener if the user picked a new key.
    if prev.hotkey != next.hotkey {
        if let Some(listener) = app.try_state::<HotkeyListener>() {
            listener.rebind(next.hotkey.clone());
        }
    }

    // free the cleanup model when the toggle goes off. it reloads lazily on
    // the next dictation if the user turns it back on.
    if prev.cleanup_enabled && !next.cleanup_enabled {
        pipeline.unload_cleanup();
    }

    // tear down the capture worker if the input device changed. the next
    // hotkey press calls ensure_capture which builds a fresh worker on the
    // new device. dropping the old worker sends shutdown to its thread.
    if prev.input_device != next.input_device {
        let mut guard = pipeline.capture.lock();
        if guard.take().is_some() {
            tracing::info!(
                old = ?prev.input_device,
                new = ?next.input_device,
                "input device changed, tearing down capture worker"
            );
        }
    }

    Ok(next)
}

/// enumerate available input devices via cpal and return name plus default
/// flag for each. side effect free. matches no emit.
#[tauri::command]
pub fn list_input_devices() -> Result<Vec<DeviceInfo>, String> {
    audio::list_input_devices()
        .map(|list| {
            list.into_iter()
                .map(|d| DeviceInfo {
                    name: d.name,
                    is_default: d.is_default,
                })
                .collect()
        })
        .map_err(err)
}

/// block until the next key press through the global hook and return its
/// hotkey string form. used by the settings ui to capture a new binding.
/// side effect: temporarily swallows one key press from the listener.
/// matches no emit.
#[tauri::command]
pub async fn capture_hotkey(listener: State<'_, HotkeyListener>) -> Result<String, String> {
    // capture_next blocks up to 30s on recv_timeout. run it off the event loop
    // thread via spawn_blocking so the ui, tray, and hotkey dispatcher are not
    // frozen while the settings page waits for a key.
    let listener = listener.inner().clone();
    let captured = tauri::async_runtime::spawn_blocking(move || listener.capture_next())
        .await
        .map_err(|e| format!("hotkey capture task failed: {e}"))?;
    captured.map_err(|e| match e {
        CaptureError::Timeout => "timed out waiting for a key press".to_string(),
        CaptureError::Unsupported => {
            "that key can't be used as a hotkey. pick a modifier (Ctrl, Alt, Shift) or a function key (F1-F12)".to_string()
        }
    })
}

/// poll the live audio level from the capture worker. returns 0.0 when no
/// capture is active. side effect free. matches no emit (the indicator
/// polls this on a timer).
#[tauri::command]
pub fn get_meter(pipeline: State<'_, Arc<Pipeline>>) -> f32 {
    pipeline.meter()
}

/// list transcripts ordered by recency, optionally filtered by a substring
/// query. side effect free. matches no emit.
#[tauri::command]
pub fn list_history(
    history: State<'_, HistoryStore>,
    query: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<Transcript>, String> {
    history
        .list(query.as_deref(), limit.unwrap_or(500))
        .map_err(err)
}

/// delete one transcript by id. side effect: removes the row from
/// history.db. matches no emit (the ui refreshes locally).
#[tauri::command]
pub fn delete_transcript(history: State<'_, HistoryStore>, id: String) -> Result<(), String> {
    history.delete(&id).map_err(err)
}

/// copy one transcript's text to the system clipboard. side effect: writes
/// the clipboard via arboard. matches no emit.
#[tauri::command]
pub fn copy_transcript(history: State<'_, HistoryStore>, id: String) -> Result<(), String> {
    let transcript = history.get(&id).map_err(err)?;
    let Some(t) = transcript else {
        return Err("transcript not found".into());
    };
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(t.text).map_err(|e| e.to_string())?;
    Ok(())
}

/// re paste an existing transcript into the current foreground window.
/// side effect: stages text on the clipboard and synthesises ctrl plus v
/// through the paste worker. matches no emit.
#[tauri::command]
pub fn repaste_transcript(
    history: State<'_, HistoryStore>,
    pipeline: State<'_, Arc<Pipeline>>,
    id: String,
) -> Result<(), String> {
    let transcript = history.get(&id).map_err(err)?;
    let Some(t) = transcript else {
        return Err("transcript not found".into());
    };
    pipeline.paste_client.paste_text(&t.text).map_err(err)
}

/// re fetch the parakeet model from huggingface into `models/parakeet/`.
/// downloads into a staging dir and only swaps it over the working model once
/// every asset is verified, so a failed refetch leaves the existing model
/// intact rather than bricking the core asr. refuses to start if another model
/// download is already running. side effect: writes the parakeet directory.
/// matches `mumble://download-progress` events emitted while bytes are streaming.
#[tauri::command]
pub async fn download_parakeet_model(
    app: AppHandle,
    active: State<'_, ActiveDownload>,
) -> Result<(), String> {
    let dir = crate::paths::parakeet_dir().map_err(err)?;

    // claim the shared download slot so a concurrent parakeet or cleanup
    // download cannot race into the same model files. clone off the State so
    // we do not hold it across the await.
    let active = active.inner().clone();
    let Some(_cancel) = active.try_begin() else {
        return Err("a model download is already in progress".into());
    };
    let result = model_download::refetch_model(&app, &dir).await;
    active.clear();
    result.map_err(err)
}

/// describe whether the parakeet assets are present, plus their on disk path
/// and the user facing model name. side effect free. matches no emit.
#[tauri::command]
pub fn model_status() -> Result<ModelStatus, String> {
    let dir = crate::paths::parakeet_dir().map_err(err)?;
    let present = model_download::model_is_present(&dir);
    Ok(ModelStatus {
        present,
        path: dir.to_string_lossy().to_string(),
        name: model_download::PARAKEET_NAME.to_string(),
    })
}

/// describe the optional cleanup model: presence, on disk path, download size,
/// and free disk so the ui can gate the download button. side effect free.
#[tauri::command]
pub fn cleanup_status() -> Result<CleanupStatus, String> {
    let dir = crate::paths::cleanup_dir().map_err(err)?;
    Ok(CleanupStatus {
        present: cleanup_model::model_is_present(&dir),
        path: dir.to_string_lossy().to_string(),
        name: cleanup_model::CLEANUP_NAME.to_string(),
        size_bytes: cleanup_model::TOTAL_BYTES,
        available_disk_bytes: cleanup_model::available_disk_bytes(&dir),
        required_disk_bytes: cleanup_model::REQUIRED_DISK_BYTES,
    })
}

/// download the cleanup model into `models/cleanup/`. refuses to start if a
/// download is already running or if the volume lacks the required free space.
/// side effect: writes the cleanup directory. matches
/// `mumble://cleanup-download-progress` events while bytes are streaming.
#[tauri::command]
pub async fn download_cleanup_model(
    app: AppHandle,
    active: State<'_, ActiveDownload>,
) -> Result<(), String> {
    let dir = crate::paths::cleanup_dir().map_err(err)?;

    let available = cleanup_model::available_disk_bytes(&dir);
    if available < cleanup_model::REQUIRED_DISK_BYTES {
        return Err(format!(
            "not enough disk space: need {:.1} GB free, have {:.1} GB",
            cleanup_model::REQUIRED_DISK_BYTES as f64 / 1e9,
            available as f64 / 1e9,
        ));
    }

    // clone the handle so we do not hold the tauri State across the await, and
    // claim the slot atomically. None means a download is already in flight.
    let active = active.inner().clone();
    let Some(cancel) = active.try_begin() else {
        return Err("a cleanup download is already in progress".into());
    };
    let result = cleanup_model::ensure_model(&app, dir, cancel).await;
    active.clear();
    result.map_err(err)
}

/// signal the in flight cleanup download to stop. the partial file is removed
/// by the downloader. side effect: flips the cancellation flag. matches no emit.
#[tauri::command]
pub fn cancel_cleanup_download(active: State<'_, ActiveDownload>) -> Result<(), String> {
    active.cancel();
    Ok(())
}

/// delete the cleanup model from disk. side effect: wipes `models/cleanup/`.
/// matches no emit (the ui refreshes via `cleanup_status`).
#[tauri::command]
pub fn delete_cleanup_model() -> Result<(), String> {
    let dir = crate::paths::cleanup_dir().map_err(err)?;
    cleanup_model::delete_model(&dir).map_err(err)
}

/// open the models directory in the os file browser. side effect: launches
/// explorer. matches no emit.
#[tauri::command]
pub fn reveal_models_dir(app: AppHandle) -> Result<(), String> {
    let dir = crate::paths::models_dir().map_err(err)?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// aggregate transcripts into insights over the last `range_days` (default
/// 7). side effect free. matches no emit.
#[tauri::command]
pub fn get_insights(
    history: State<'_, HistoryStore>,
    range_days: Option<u32>,
) -> Result<InsightsData, String> {
    history.insights(range_days.unwrap_or(7)).map_err(err)
}

/// extract a base64 png icon for an executable on disk and cache it.
/// rejects paths outside the windows install allowlist. side effect:
/// populates the `IconCache`. matches no emit.
#[tauri::command]
pub fn get_app_icon(
    pipeline: State<'_, Arc<Pipeline>>,
    exe_path: String,
) -> Result<Option<String>, String> {
    if !is_allowed_exe_path(&exe_path) {
        return Err("path not allowed".into());
    }
    Ok(pipeline.state.icon_cache.get_or_extract(&exe_path))
}

// only allow icon extraction for executables under known windows install
// roots. blocks attempts to coerce shell32 into reading attacker controlled
// paths or unc shares.
fn is_allowed_exe_path(exe_path: &str) -> bool {
    let normalized = exe_path.replace('/', "\\").to_ascii_lowercase();
    let roots = allowed_exe_roots();
    roots
        .iter()
        .any(|root| !root.is_empty() && normalized.starts_with(root))
}

fn allowed_exe_roots() -> Vec<String> {
    let envs = ["ProgramFiles", "ProgramFiles(x86)", "SystemRoot", "AppData"];
    let mut roots: Vec<String> = envs
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .map(|v| v.replace('/', "\\").to_ascii_lowercase())
        .collect();
    if let Ok(local) = std::env::var("LocalAppData") {
        let local = local.replace('/', "\\");
        roots.push(format!("{}\\programs", local.to_ascii_lowercase()));
        roots.push(format!(
            "{}\\microsoft\\windowsapps",
            local.to_ascii_lowercase()
        ));
    }
    roots
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub present: bool,
    pub path: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupStatus {
    pub present: bool,
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub available_disk_bytes: u64,
    pub required_disk_bytes: u64,
}

/// list every dictionary entry in priority order. side effect free.
/// matches no emit.
#[tauri::command]
pub fn list_dictionary(history: State<'_, HistoryStore>) -> Result<Vec<DictEntry>, String> {
    history.list_dictionary().map_err(err)
}

/// insert a new dictionary entry and return the created row. side effect:
/// writes the dictionary table. matches no emit.
#[tauri::command]
pub fn add_dictionary_entry(
    history: State<'_, HistoryStore>,
    pattern: String,
    replacement: String,
    case_sensitive: bool,
    fuzzy: bool,
) -> Result<DictEntry, String> {
    if pattern.len() > DICT_FIELD_MAX_BYTES {
        return Err(format!(
            "dictionary pattern too large ({} bytes, max {})",
            pattern.len(),
            DICT_FIELD_MAX_BYTES
        ));
    }
    if replacement.len() > DICT_FIELD_MAX_BYTES {
        return Err(format!(
            "dictionary replacement too large ({} bytes, max {})",
            replacement.len(),
            DICT_FIELD_MAX_BYTES
        ));
    }
    history
        .add_dictionary_entry(pattern.trim(), replacement.trim(), case_sensitive, fuzzy)
        .map_err(err)
}

/// delete one dictionary entry by id. side effect: writes the dictionary
/// table. matches no emit.
#[tauri::command]
pub fn delete_dictionary_entry(history: State<'_, HistoryStore>, id: i64) -> Result<(), String> {
    history.delete_dictionary_entry(id).map_err(err)
}

/// persist a transcript edit and return suggested corrections (wrong to
/// right pairs) for the frontend to offer adding to the dictionary. side
/// effect: writes the transcripts table. matches no emit.
#[tauri::command]
pub fn update_transcript(
    history: State<'_, HistoryStore>,
    id: String,
    text: String,
) -> Result<Vec<Correction>, String> {
    if text.len() > TRANSCRIPT_MAX_BYTES {
        return Err(format!(
            "transcript too large ({} bytes, max {})",
            text.len(),
            TRANSCRIPT_MAX_BYTES
        ));
    }
    let prev = history.update_transcript_text(&id, &text).map_err(err)?;
    match prev {
        Some(original) => Ok(crate::dictionary::extract_corrections(&original, &text)),
        None => Err("transcript not found".into()),
    }
}
