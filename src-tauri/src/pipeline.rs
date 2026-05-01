//! the core dictation pipeline. hotkey press, record, transcribe, paste.
//!
//! mirrors hex's `TranscriptionFeature` (tca reducer) flow:
//!   * hotkey press kicks off recording with a pre roll prepend
//!   * hotkey release stops capture, runs transcription, pastes (or copies)
//!   * sub threshold taps short circuit back to idle without transcribing
//!
//! pre roll, auto paste, and the discard floor are the three knobs that
//! determine "feel". see settings.

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
use crate::target_app;
use crate::transcribe::Transcriber;

/// sub threshold tap floor measured in wall clock press time. anything
/// shorter than this is treated as a fat finger tap and discarded without
/// transcription. hex uses a similar `RecordingDecisionEngine` floor.
const MIN_RECORDING_SEC: f64 = 0.30;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateChangedEvent {
    pub state: AppState,
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
    /// wall clock time of the most recent hotkey press, used for the
    /// sub threshold tap floor. audio duration would include the pre roll
    /// and so cannot be used for this purpose.
    recording_started_at: Arc<Mutex<Option<Instant>>>,
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

    /// called from the hotkey thread when the user presses the key.
    pub fn on_hotkey_press(&self, app: &AppHandle) {
        let t0 = Instant::now();
        tracing::info!("on_hotkey_press: enter");

        let settings = self.settings.get();

        if settings.paused {
            tracing::info!("on_hotkey_press: paused, ignoring");
            return;
        }

        // don't let the user start recording into the void if the model is
        // still loading. hex bails the same way (see `TranscriptionFeature`,
        // it gates on the transcriber being initialised).
        if self.transcriber.lock().is_none() {
            tracing::warn!("on_hotkey_press: transcriber not ready");
            emit_error(app, "Mumble is still loading the model. Please wait.".into());
            return;
        }

        // only start if we're idle. anything else means a transcribe is in
        // flight.
        if !self.state.compare_set(AppState::Idle, AppState::Recording) {
            tracing::warn!(state = ?self.state.get(), "on_hotkey_press: not in Idle, ignoring");
            return;
        }

        if let Err(e) = self.ensure_capture(settings.input_device.as_deref()) {
            tracing::error!(?e, "ensure_capture failed");
            self.state.set(AppState::Idle);
            emit_error(app, e.to_string());
            return;
        }

        if let Some(cap) = self.capture.lock().as_ref() {
            cap.start_recording(settings.pre_roll_ms);
        }
        *self.recording_started_at.lock() = Some(Instant::now());

        emit_state(app, AppState::Recording);
        show_indicator(app);
        tracing::info!(elapsed_ms = t0.elapsed().as_millis() as u64, "on_hotkey_press: indicator shown");
    }

    /// called from the hotkey thread on key release.
    pub fn on_hotkey_release(&self, app: &AppHandle) {
        tracing::info!("on_hotkey_release: enter");
        if !self
            .state
            .compare_set(AppState::Recording, AppState::Transcribing)
        {
            tracing::warn!(state = ?self.state.get(), "on_hotkey_release: not in Recording, ignoring");
            return;
        }

        // wall clock press duration. the audio's own duration includes
        // pre roll, which would mask sub threshold taps.
        let press_duration_sec = self
            .recording_started_at
            .lock()
            .take()
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0);

        let (samples, _audio_duration_sec) = match self.capture.lock().as_ref() {
            Some(cap) => cap.stop_recording(),
            None => (Vec::new(), 0.0),
        };

        if press_duration_sec < MIN_RECORDING_SEC {
            self.state.set(AppState::Idle);
            emit_state(app, AppState::Idle);
            hide_indicator(app);
            return;
        }

        emit_state(app, AppState::Transcribing);

        let release_time = Instant::now();
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

            // capture the foreground app before we touch the clipboard or
            // synth keystrokes. afterwards the focus may have shifted.
            let captured_app = if settings.auto_paste {
                target_app::current_foreground_app()
            } else {
                None
            };

            let paste_result = if settings.auto_paste {
                paste::paste_text(&text)
            } else {
                paste::copy_only(&text)
            };
            if let Err(e) = paste_result {
                tracing::error!(?e, "paste failed");
                emit_error(&app, e.to_string());
            }

            let latency_ms = Some(release_time.elapsed().as_millis() as i64);

            let transcript = Transcript {
                id: new_id(),
                created_at: Utc::now(),
                duration_sec: press_duration_sec,
                text: text.clone(),
                input_device: settings.input_device.clone(),
                model: transcriber
                    .as_ref()
                    .map(|t| t.name().to_string())
                    .unwrap_or_else(|| "unknown".into()),
                latency_ms,
                target_app: captured_app,
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

/// show the indicator at the bottom center of the active monitor.
///
/// always on top and click through are set once at app startup (see `lib.rs`).
/// this function only handles per press positioning and show or hide.
fn show_indicator(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("indicator") {
        if let Err(e) = position_indicator(&win) {
            tracing::warn!(?e, "position indicator");
        }
        let _ = win.show();
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
