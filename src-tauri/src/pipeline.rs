//! The core dictation pipeline: hotkey press -> record -> transcribe -> paste.
//!
//! Owns the long-lived `CaptureEngine` and a `Transcriber` handle. Emits
//! typed events to the frontend at each state transition so the indicator
//! window, tray icon, and history view can react.

use anyhow::Result;
use chrono::Utc;
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

use crate::audio::CaptureEngine;
use crate::history::{HistoryStore, Transcript};
use crate::paste;
use crate::settings::SettingsStore;
use crate::state::{AppState, SharedState};
use crate::transcribe::Transcriber;

const MIN_RECORDING_SEC: f64 = 0.30;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateChangedEvent {
    pub state: AppState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeterEvent {
    pub rms: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribedEvent {
    pub transcript: Transcript,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEvent {
    pub message: String,
}

pub struct Pipeline {
    pub state: Arc<SharedState>,
    pub capture: Arc<Mutex<Option<CaptureEngine>>>,
    pub transcriber: Arc<Mutex<Option<Arc<dyn Transcriber>>>>,
    pub history: HistoryStore,
    pub settings: SettingsStore,
    pub recording_started_at: Arc<Mutex<Option<Instant>>>,
}

impl Pipeline {
    pub fn new(history: HistoryStore, settings: SettingsStore) -> Self {
        Self {
            state: Arc::new(SharedState::new()),
            capture: Arc::new(Mutex::new(None)),
            transcriber: Arc::new(Mutex::new(None)),
            history,
            settings,
            recording_started_at: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_transcriber(&self, t: Arc<dyn Transcriber>) {
        *self.transcriber.lock() = Some(t);
    }

    pub fn ensure_capture(&self, device: Option<&str>) -> Result<()> {
        let mut guard = self.capture.lock();
        if guard.is_none() {
            *guard = Some(CaptureEngine::start(device)?);
        }
        Ok(())
    }

    /// Called from the hotkey thread when the user presses the key.
    pub fn on_hotkey_press(&self, app: &AppHandle) {
        if self.settings.get().paused {
            return;
        }
        // Only start if we're Idle. Anything else means a transcribe is in
        // flight or we're paused.
        if !self.state.compare_set(AppState::Idle, AppState::Recording) {
            return;
        }

        if let Err(e) = self.ensure_capture(self.settings.get().input_device.as_deref()) {
            tracing::error!(?e, "ensure_capture failed");
            self.state.set(AppState::Idle);
            emit_error(app, e.to_string());
            return;
        }

        if let Some(cap) = self.capture.lock().as_ref() {
            cap.start_recording();
        }
        *self.recording_started_at.lock() = Some(Instant::now());

        emit_state(app, AppState::Recording);
        show_indicator(app);
    }

    /// Called from the hotkey thread on key release.
    pub fn on_hotkey_release(&self, app: &AppHandle) {
        if !self
            .state
            .compare_set(AppState::Recording, AppState::Transcribing)
        {
            return;
        }

        let (samples, duration) = match self.capture.lock().as_ref() {
            Some(cap) => cap.stop_recording(),
            None => (Vec::new(), 0.0),
        };

        // Sub-threshold tap — reset without transcribing.
        if duration < MIN_RECORDING_SEC {
            self.state.set(AppState::Idle);
            emit_state(app, AppState::Idle);
            hide_indicator(app);
            return;
        }

        emit_state(app, AppState::Transcribing);

        let app = app.clone();
        let transcriber = self.transcriber.lock().clone();
        let history = self.history.clone();
        let shared_state = self.state.clone();
        let settings = self.settings.get();

        tauri::async_runtime::spawn_blocking(move || {
            let text = match &transcriber {
                Some(t) => t.transcribe(&samples).unwrap_or_else(|e| {
                    tracing::error!(?e, "transcribe failed");
                    emit_error(&app, e.to_string());
                    String::new()
                }),
                None => {
                    emit_error(&app, "transcriber not initialised".into());
                    String::new()
                }
            };

            if text.is_empty() {
                shared_state.set(AppState::Idle);
                emit_state(&app, AppState::Idle);
                hide_indicator(&app);
                return;
            }

            shared_state.set(AppState::Pasting);
            emit_state(&app, AppState::Pasting);

            if let Err(e) = paste::paste_text(&text) {
                tracing::error!(?e, "paste failed");
                emit_error(&app, e.to_string());
            }

            let transcript = Transcript {
                id: new_id(),
                created_at: Utc::now(),
                duration_sec: duration,
                text: text.clone(),
                input_device: settings.input_device.clone(),
                model: transcriber
                    .as_ref()
                    .map(|t| t.name().to_string())
                    .unwrap_or_else(|| "unknown".into()),
            };
            if let Err(e) = history.insert(&transcript) {
                tracing::error!(?e, "history.insert failed");
            }
            let _ = app.emit(
                "mumble://transcribed",
                TranscribedEvent {
                    transcript: transcript.clone(),
                },
            );

            shared_state.set(AppState::Idle);
            emit_state(&app, AppState::Idle);
            hide_indicator(&app);
        });
    }

    pub fn meter(&self) -> f32 {
        self.capture
            .lock()
            .as_ref()
            .map(|c| c.current_rms())
            .unwrap_or(0.0)
    }
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("t_{:x}", nanos)
}

fn emit_state(app: &AppHandle, state: AppState) {
    let _ = app.emit("mumble://state-changed", StateChangedEvent { state });
}

fn emit_error(app: &AppHandle, message: String) {
    let _ = app.emit("mumble://error", ErrorEvent { message });
}

fn show_indicator(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("indicator") {
        if let Err(e) = position_indicator(&win) {
            tracing::warn!(?e, "position indicator");
        }
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_ignore_cursor_events(true);
    }
}

fn hide_indicator(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("indicator") {
        let _ = win.hide();
    }
}

fn position_indicator(win: &tauri::WebviewWindow) -> Result<()> {
    let monitor = win
        .current_monitor()?
        .or_else(|| win.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let size = m.size();
        let scale = m.scale_factor();
        let win_size = win.outer_size()?;
        let x = (size.width as i32 - win_size.width as i32) / 2;
        let y = size.height as i32 - win_size.height as i32 - (80.0 * scale) as i32;
        win.set_position(tauri::PhysicalPosition::new(x, y))?;
    }
    Ok(())
}
