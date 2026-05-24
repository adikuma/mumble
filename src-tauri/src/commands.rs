//! all `#[tauri::command]` handlers the frontend can invoke.

use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::audio;
use crate::dictionary::{Correction, DictEntry};
use crate::history::{HistoryStore, InsightsData, Note, Transcript};
use crate::hotkey::HotkeyListener;
use crate::model_download;
use crate::paste;
use crate::pipeline::Pipeline;
use crate::settings::{Settings, SettingsStore};
use crate::state::AppState;

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Settings {
    store.get()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    patch: serde_json::Value,
) -> Result<Settings, String> {
    let prev = store.get();
    let next = store
        .update(|s| {
            if let Some(v) = patch.get("hotkey").and_then(|x| x.as_str()) {
                s.hotkey = v.to_string();
            }
            if let Some(v) = patch.get("inputDevice") {
                s.input_device = v.as_str().map(|x| x.to_string());
            }
            if let Some(v) = patch.get("launchAtLogin").and_then(|x| x.as_bool()) {
                s.launch_at_login = v;
            }
            if let Some(v) = patch.get("startMinimized").and_then(|x| x.as_bool()) {
                s.start_minimized = v;
            }
            if let Some(v) = patch.get("theme").and_then(|x| x.as_str()) {
                s.theme = v.to_string();
            }
            if let Some(v) = patch.get("paused").and_then(|x| x.as_bool()) {
                s.paused = v;
            }
            if let Some(v) = patch.get("preRollMs").and_then(|x| x.as_u64()) {
                s.pre_roll_ms = v as u32;
            }
            if let Some(v) = patch.get("autoPaste").and_then(|x| x.as_bool()) {
                s.auto_paste = v;
            }
        })
        .map_err(err)?;

    // reconcile autostart with the os if the toggle changed.
    if prev.launch_at_login != next.launch_at_login {
        let manager = app.autolaunch();
        let result = if next.launch_at_login {
            manager.enable()
        } else {
            manager.disable()
        };
        if let Err(e) = result {
            tracing::warn!(?e, "autostart toggle failed");
        }
    }

    // live rebind the hotkey listener if the user picked a new key.
    if prev.hotkey != next.hotkey {
        if let Some(listener) = app.try_state::<HotkeyListener>() {
            listener.rebind(next.hotkey.clone());
        }
    }

    Ok(next)
}

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

#[tauri::command]
pub fn capture_hotkey(listener: State<'_, HotkeyListener>) -> Result<String, String> {
    listener
        .capture_next()
        .ok_or_else(|| "timed out waiting for key press".to_string())
}

#[tauri::command]
pub fn get_state(pipeline: State<'_, Arc<Pipeline>>) -> AppState {
    pipeline.state.get()
}

#[tauri::command]
pub fn get_meter(pipeline: State<'_, Arc<Pipeline>>) -> f32 {
    pipeline.meter()
}

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

#[tauri::command]
pub fn delete_transcript(history: State<'_, HistoryStore>, id: String) -> Result<(), String> {
    history.delete(&id).map_err(err)
}

#[tauri::command]
pub fn clear_history(history: State<'_, HistoryStore>) -> Result<(), String> {
    history.clear().map_err(err)
}

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

#[tauri::command]
pub fn repaste_transcript(history: State<'_, HistoryStore>, id: String) -> Result<(), String> {
    let transcript = history.get(&id).map_err(err)?;
    let Some(t) = transcript else {
        return Err("transcript not found".into());
    };
    paste::paste_text(&t.text).map_err(err)
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub async fn redownload_model(app: AppHandle) -> Result<(), String> {
    let dir = crate::paths::models_dir().map_err(err)?;
    model_download::delete_model(&dir).map_err(err)?;
    model_download::ensure_model(&app, dir).await.map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn model_status() -> Result<ModelStatus, String> {
    let dir = crate::paths::models_dir().map_err(err)?;
    let present = model_download::model_is_present(&dir);
    Ok(ModelStatus {
        present,
        path: dir.to_string_lossy().to_string(),
        name: "Parakeet-TDT v3 (English, int8)".into(),
    })
}

#[tauri::command]
pub fn get_insights(
    history: State<'_, HistoryStore>,
    range_days: Option<u32>,
) -> Result<InsightsData, String> {
    history.insights(range_days.unwrap_or(7)).map_err(err)
}

#[tauri::command]
pub fn get_app_icon(
    pipeline: State<'_, Arc<Pipeline>>,
    exe_path: String,
) -> Option<String> {
    pipeline.state.icon_cache.get_or_extract(&exe_path)
}

#[tauri::command]
pub fn list_notes(history: State<'_, HistoryStore>) -> Result<Vec<Note>, String> {
    history.list_notes().map_err(err)
}

#[tauri::command]
pub fn save_note(
    history: State<'_, HistoryStore>,
    id: String,
    title: String,
    body: String,
) -> Result<Note, String> {
    history.save_note(&id, &title, &body).map_err(err)
}

#[tauri::command]
pub fn delete_note(history: State<'_, HistoryStore>, id: String) -> Result<(), String> {
    history.delete_note(&id).map_err(err)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub present: bool,
    pub path: String,
    pub name: String,
}

#[tauri::command]
pub fn list_dictionary(history: State<'_, HistoryStore>) -> Result<Vec<DictEntry>, String> {
    history.list_dictionary().map_err(err)
}

#[tauri::command]
pub fn add_dictionary_entry(
    history: State<'_, HistoryStore>,
    pattern: String,
    replacement: String,
    case_sensitive: bool,
    fuzzy: bool,
) -> Result<DictEntry, String> {
    history
        .add_dictionary_entry(pattern.trim(), replacement.trim(), case_sensitive, fuzzy)
        .map_err(err)
}

#[tauri::command]
pub fn update_dictionary_entry(
    history: State<'_, HistoryStore>,
    id: i64,
    pattern: String,
    replacement: String,
    case_sensitive: bool,
    fuzzy: bool,
) -> Result<(), String> {
    history
        .update_dictionary_entry(id, pattern.trim(), replacement.trim(), case_sensitive, fuzzy)
        .map_err(err)
}

#[tauri::command]
pub fn delete_dictionary_entry(history: State<'_, HistoryStore>, id: i64) -> Result<(), String> {
    history.delete_dictionary_entry(id).map_err(err)
}

// persist a transcript edit and return suggested corrections (wrong to
// right pairs) for the frontend to offer adding to the dictionary.
#[tauri::command]
pub fn update_transcript(
    history: State<'_, HistoryStore>,
    id: String,
    text: String,
) -> Result<Vec<Correction>, String> {
    let prev = history.update_transcript_text(&id, &text).map_err(err)?;
    match prev {
        Some(original) => Ok(crate::dictionary::extract_corrections(&original, &text)),
        None => Err("transcript not found".into()),
    }
}
