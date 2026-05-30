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

use crate::audio::CaptureWorker;
use crate::history::{HistoryStore, Transcript};
use crate::paste::PasteClient;
use crate::settings::SettingsStore;
use crate::state::{AppState, SharedState};
use crate::target_app;
use crate::transcribe::Transcriber;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
};

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkProgressEvent {
    pub current: u32,
    pub total: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastEvent {
    pub kind: String,
    pub text: String,
}

pub struct Pipeline {
    pub state: Arc<SharedState>,
    pub capture: Arc<Mutex<Option<CaptureWorker>>>,
    pub transcriber: Arc<Mutex<Option<Arc<dyn Transcriber>>>>,
    pub history: HistoryStore,
    pub settings: SettingsStore,
    /// long lived paste worker. owns a single sta com apartment for the
    /// life of the app so every clipboard and `SendInput` call lands on the
    /// same thread.
    pub paste_client: PasteClient,
    /// wall clock time of the most recent hotkey press, used for the
    /// sub threshold tap floor. audio duration would include the pre roll
    /// and so cannot be used for this purpose.
    recording_started_at: Arc<Mutex<Option<Instant>>>,
}

impl Pipeline {
    pub fn new(history: HistoryStore, settings: SettingsStore, paste_client: PasteClient) -> Self {
        Self {
            state: Arc::new(SharedState::new()),
            capture: Arc::new(Mutex::new(None)),
            transcriber: Arc::new(Mutex::new(None)),
            history,
            settings,
            paste_client,
            recording_started_at: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_transcriber(&self, t: Arc<dyn Transcriber>) {
        *self.transcriber.lock() = Some(t);
    }

    pub fn ensure_capture(&self, device: Option<&str>) -> Result<()> {
        let mut guard = self.capture.lock();
        if guard.is_none() {
            *guard = Some(CaptureWorker::start(device.map(|s| s.to_string()))?);
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
            emit_error(
                app,
                "Mumble is still loading the model. Please wait.".into(),
            );
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
        tracing::info!(
            elapsed_ms = t0.elapsed().as_millis() as u64,
            "on_hotkey_press: indicator shown"
        );
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

        // an empty samples vec means the capture worker reported no audio.
        // this happens when the input device disappears mid press or wasapi
        // refuses to start the stream. skip the transcribe path entirely
        // and surface a banner so the user knows why nothing was pasted.
        if samples.is_empty() {
            tracing::warn!("on_hotkey_release: capture returned empty samples");
            self.state.set(AppState::Idle);
            emit_state(app, AppState::Idle);
            hide_indicator(app);
            let _ = app.emit(
                "mumble://error",
                serde_json::json!({
                    "kind": "capture-unavailable",
                    "message": "no audio captured. check your input device in settings.",
                }),
            );
            return;
        }

        emit_state(app, AppState::Transcribing);

        let release_time = Instant::now();
        let app = app.clone();
        let transcriber = self.transcriber.lock().clone();
        let history = self.history.clone();
        let shared_state = self.state.clone();
        let settings = self.settings.get();
        let paste_client = self.paste_client.clone();

        // schedule a 30s watchdog. if the transcribe/paste path is still
        // running by then something is wedged (sherpa onnx hang, paste
        // worker stuck, etc). reset to idle, hide the indicator, and let
        // the ui banner the user instead of leaving the app frozen.
        spawn_watchdog(app.clone(), shared_state.clone());

        tauri::async_runtime::spawn_blocking(move || {
            // chunk the audio so each piece stays under the sherpa onnx
            // directml cliff (~10 s). short clips return one chunk and behave
            // identically to the pre chunking path.
            let chunks = crate::audio::chunk_for_transcription(&samples, 16_000);
            let total = chunks.len() as u32;
            tracing::debug!(
                total_chunks = total,
                total_samples = samples.len(),
                total_duration_sec = format!("{:.2}", samples.len() as f32 / 16_000.0),
                "transcribe: chunked"
            );

            // capture the foreground app and snapshot the clipboard before any
            // paste keystrokes. once we synth Ctrl+V the focus may shift.
            let captured = if settings.auto_paste {
                target_app::current_foreground_app()
            } else {
                None
            };
            let captured_app = captured.as_ref().map(|c| c.name.clone());
            let captured_app_path = captured.as_ref().map(|c| c.path.clone());
            let captured_hwnd: isize = captured.as_ref().map(|c| c.hwnd).unwrap_or(0);
            let prior_clipboard = if settings.auto_paste {
                paste_client.snapshot_clipboard()
            } else {
                None
            };

            // diagnostic. confirm which app we captured as the paste target.
            tracing::debug!(?captured_app, "paste: captured foreground target");

            shared_state.set(AppState::Pasting);
            emit_state(&app, AppState::Pasting);

            // load the dictionary once. apply it to each chunk so both the
            // streamed paste and the stored transcript come out corrected.
            let dict = history.list_dictionary().unwrap_or_default();

            let mut accumulated = String::new();
            // flipped if the focus mismatch fallback fires. in that case the
            // accumulated text is already sitting in the clipboard via
            // `copy_only` and we must NOT restore the prior clipboard at the
            // end of the run, or we would wipe the user's transcript.
            let mut focus_fallback_fired = false;

            for (i, chunk) in chunks.iter().enumerate() {
                let idx = i as u32 + 1;
                emit_chunk_progress(&app, idx, total);
                tracing::debug!(
                    chunk = idx,
                    of = total,
                    samples = chunk.len(),
                    duration_sec = format!("{:.2}", chunk.len() as f32 / 16_000.0),
                    "transcribe: chunk"
                );

                let text = match &transcriber {
                    Some(t) => t.transcribe(chunk).unwrap_or_else(|e| {
                        tracing::error!(?e, "transcribe failed");
                        emit_error(&app, e.to_string());
                        String::new()
                    }),
                    None => {
                        emit_error(&app, "transcriber not initialised".into());
                        String::new()
                    }
                };

                // run the custom dictionary over this chunk before paste.
                let text = crate::dictionary::apply(&text, &dict);

                if text.is_empty() {
                    tracing::warn!(chunk = idx, of = total, "chunk returned empty, skipping");
                    continue;
                }

                let leading_space = !accumulated.is_empty();
                if leading_space {
                    accumulated.push(' ');
                }
                accumulated.push_str(&text);

                if settings.auto_paste {
                    // re focus the captured window before each paste.
                    // SetForegroundWindow can fail if the user has moved focus
                    // themselves, or if windows refuses to honour our attempt.
                    let focus_result = paste_client.focus_target(captured_hwnd);
                    if let Err(ref e) = focus_result {
                        tracing::warn!(?e, chunk = idx, "paste: focus_target failed");
                    }

                    // sanity check the actual foreground hwnd against what we
                    // captured. if they disagree AND we could not re focus,
                    // synthesising ctrl plus v would paste into the wrong app,
                    // so fall back to copy only and tell the ui about it.
                    let fg_now = target_app::current_foreground_hwnd();
                    let mismatch = captured_hwnd != 0 && fg_now != captured_hwnd;
                    tracing::debug!(
                        fg_now,
                        captured_hwnd,
                        chunk = idx,
                        mismatch,
                        "paste: foreground before Ctrl+V"
                    );

                    if mismatch && focus_result.is_err() {
                        if let Err(e) = paste_client.copy_only(&accumulated) {
                            tracing::error!(?e, "copy_only fallback failed");
                            emit_error(&app, e.to_string());
                        }
                        emit_toast(
                            &app,
                            "focus-changed",
                            "focus changed, copied to clipboard instead",
                        );
                        focus_fallback_fired = true;
                        // skip the keystroke and the rest of the chunks. the
                        // user can paste the joined transcript manually.
                        break;
                    }

                    if let Err(e) =
                        paste_client.paste_chunk(text.clone(), leading_space, captured_hwnd)
                    {
                        tracing::error!(?e, "paste_chunk failed");
                        emit_error(&app, e.to_string());
                    }
                }
            }

            // restore the clipboard once after every paste lands. for the
            // copy only path, write the joined transcript to the clipboard
            // so the user can manually paste it wherever they want. when the
            // focus mismatch fallback fired, leave the transcript in the
            // clipboard so the user can paste it themselves.
            if settings.auto_paste && !focus_fallback_fired {
                if let Err(e) = paste_client.restore_clipboard(prior_clipboard) {
                    tracing::error!(?e, "restore_clipboard failed");
                }
            } else if !settings.auto_paste && !accumulated.trim().is_empty() {
                if let Err(e) = paste_client.copy_only(accumulated.trim()) {
                    tracing::error!(?e, "copy_only failed");
                    emit_error(&app, e.to_string());
                }
            }

            let trimmed = accumulated.trim().to_string();

            if trimmed.is_empty() {
                tracing::warn!(
                    samples = samples.len(),
                    press_duration_sec,
                    "all chunks returned empty, no transcript produced"
                );
                emit_error(
                    &app,
                    "Transcription returned empty. Try a shorter recording or check the dev terminal for sherpa onnx errors.".into(),
                );
                shared_state.set(AppState::Idle);
                emit_state(&app, AppState::Idle);
                hide_indicator(&app);
                return;
            }

            let latency_ms = Some(release_time.elapsed().as_millis() as i64);

            let transcript = Transcript {
                id: new_id(),
                created_at: Utc::now(),
                duration_sec: press_duration_sec,
                text: trimmed.clone(),
                input_device: settings.input_device.clone(),
                model: transcriber
                    .as_ref()
                    .map(|t| t.name().to_string())
                    .unwrap_or_else(|| "unknown".into()),
                latency_ms,
                target_app: captured_app,
                target_app_path: captured_app_path,
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
    uuid::Uuid::new_v4().to_string()
}

/// run a 30 s watchdog on a background thread. if the app state has not
/// returned to idle by the deadline the transcribe or paste path is wedged.
/// the watchdog resets to idle, hides the indicator, and emits a stuck
/// error so the ui can banner the user.
fn spawn_watchdog(app: AppHandle, shared_state: Arc<SharedState>) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let current = shared_state.get();
        if matches!(
            current,
            AppState::Recording | AppState::Transcribing | AppState::Pasting
        ) {
            tracing::warn!(?current, "watchdog: pipeline stuck, resetting to idle");
            shared_state.set(AppState::Idle);
            emit_state(&app, AppState::Idle);
            hide_indicator(&app);
            let _ = app.emit(
                "mumble://error",
                serde_json::json!({
                    "kind": "stuck",
                    "state": format!("{current:?}"),
                }),
            );
        }
    });
}

fn emit_state(app: &AppHandle, state: AppState) {
    let _ = app.emit("mumble://state-changed", StateChangedEvent { state });
}

fn emit_error(app: &AppHandle, message: String) {
    let _ = app.emit("mumble://error", ErrorEvent { message });
}

fn emit_chunk_progress(app: &AppHandle, current: u32, total: u32) {
    let _ = app.emit(
        "mumble://chunk-progress",
        ChunkProgressEvent { current, total },
    );
}

fn emit_toast(app: &AppHandle, kind: &str, text: &str) {
    let _ = app.emit(
        "mumble://toast",
        ToastEvent {
            kind: kind.to_string(),
            text: text.to_string(),
        },
    );
}

/// show the indicator at the bottom center of the active monitor.
///
/// always on top and click through are set once at app startup (see `lib.rs`).
/// this function only handles per press positioning and show. on windows we
/// route the show through `SetWindowPos(SWP_SHOWWINDOW | SWP_NOACTIVATE)` so
/// the indicator never steals foreground from whatever app the user is
/// currently typing into.
fn show_indicator(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("indicator") {
        if let Err(e) = position_indicator(&win) {
            tracing::warn!(?e, "position indicator");
        }
        #[cfg(windows)]
        {
            if let Err(e) = show_indicator_noactivate(&win) {
                tracing::warn!(?e, "show indicator via SetWindowPos failed, falling back");
                let _ = win.show();
            }
        }
        #[cfg(not(windows))]
        {
            let _ = win.show();
        }
    }
}

#[cfg(windows)]
fn show_indicator_noactivate(win: &tauri::WebviewWindow) -> Result<()> {
    let raw = win.hwnd().map_err(|e| anyhow::anyhow!("hwnd: {e}"))?;
    let hwnd = HWND(raw.0 as *mut core::ffi::c_void);
    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
        )
        .map_err(|e| anyhow::anyhow!("SetWindowPos: {e}"))?;
    }
    Ok(())
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
