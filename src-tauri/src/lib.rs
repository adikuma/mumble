mod audio;
mod commands;
mod history;
mod hotkey;
mod model_download;
mod paste;
mod paths;
mod pipeline;
mod settings;
mod state;
mod target_app;
mod transcribe;
mod tray;

use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tracing_subscriber::EnvFilter;

use crate::history::HistoryStore;
use crate::hotkey::{HotkeyEvent, HotkeyListener};
use crate::pipeline::Pipeline;
use crate::settings::SettingsStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("MUMBLE_LOG").unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();

    let settings = SettingsStore::load();
    let history = HistoryStore::open().expect("failed to open history.db");
    let pipeline = Arc::new(Pipeline::new(history.clone(), settings.clone()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(settings.clone())
        .manage(history.clone())
        .manage(pipeline.clone())
        .setup({
            let settings = settings.clone();
            let pipeline = pipeline.clone();
            move |app| {
                // 1. build the tray icon.
                if let Err(e) = tray::build(app.handle()) {
                    tracing::error!(?e, "failed to build tray");
                }

                // 2. hide main window if user prefers start minimized.
                if settings.get().start_minimized {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }

                // 3. indicator window. hidden at launch and click through set
                //    once (bug fix. was previously reapplied on every press).
                if let Some(win) = app.get_webview_window("indicator") {
                    let _ = win.hide();
                    let _ = win.set_ignore_cursor_events(true);
                }

                // 4. sync the os autostart entry with our persisted setting.
                //    the plugin doesn't auto sync. if a user toggled the
                //    setting in a previous run we have to reconcile here.
                let manager = app.autolaunch();
                let want = settings.get().launch_at_login;
                let have = manager.is_enabled().unwrap_or(false);
                if want != have {
                    let result = if want {
                        manager.enable()
                    } else {
                        manager.disable()
                    };
                    if let Err(e) = result {
                        tracing::warn!(?e, "autostart sync failed");
                    }
                }

                // 5. kick off the global hotkey listener.
                let app_handle = app.handle().clone();
                let pipeline_for_hotkey = pipeline.clone();
                let listener = HotkeyListener::spawn(settings.get().hotkey, move |evt| {
                    let app = app_handle.clone();
                    let pipeline = pipeline_for_hotkey.clone();
                    // offload to an async runtime so the hotkey callback
                    // returns quickly. rdev is very sensitive to blocking.
                    tauri::async_runtime::spawn_blocking(move || match evt {
                        HotkeyEvent::Pressed => pipeline.on_hotkey_press(&app),
                        HotkeyEvent::Released => pipeline.on_hotkey_release(&app),
                    });
                });
                app.manage(listener);

                // 6. load the transcriber in the background. may download
                //    the model on first run, which takes time.
                let app_handle = app.handle().clone();
                let pipeline_for_load = pipeline.clone();
                tauri::async_runtime::spawn(async move {
                    let dir = match paths::models_dir() {
                        Ok(d) => d,
                        Err(e) => {
                            tracing::error!(?e, "models_dir failed");
                            return;
                        }
                    };
                    if let Err(e) = model_download::ensure_model(&app_handle, dir.clone()).await {
                        tracing::error!(?e, "model download failed");
                        let _ = app_handle.emit(
                            "mumble://error",
                            serde_json::json!({
                                "message": format!("model download failed: {e}")
                            }),
                        );
                        return;
                    }
                    match transcribe::load(dir) {
                        Ok(t) => {
                            let t: Arc<dyn transcribe::Transcriber> = Arc::from(t);
                            pipeline_for_load.set_transcriber(t);
                            let _ = app_handle
                                .emit("mumble://ready", serde_json::json!({ "ready": true }));
                        }
                        Err(e) => {
                            tracing::error!(?e, "transcriber init failed");
                            let _ = app_handle.emit(
                                "mumble://error",
                                serde_json::json!({
                                    "message": format!("transcriber init failed: {e}")
                                }),
                            );
                        }
                    }
                });

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            // closing the main window should just hide it to the tray, not
            // quit the app. the user quits via tray menu.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::list_input_devices,
            commands::capture_hotkey,
            commands::get_state,
            commands::get_meter,
            commands::list_history,
            commands::delete_transcript,
            commands::clear_history,
            commands::copy_transcript,
            commands::repaste_transcript,
            commands::hide_main_window,
            commands::show_main_window,
            commands::redownload_model,
            commands::model_status,
            commands::get_insights,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
