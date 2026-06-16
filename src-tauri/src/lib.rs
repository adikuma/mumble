pub mod app_icons;
mod audio;
mod cleanup_infer;
mod cleanup_model;
mod commands;
mod dictionary;
mod download;
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
use std::thread;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tracing_subscriber::EnvFilter;

use crate::history::HistoryStore;
use crate::hotkey::{HotkeyEvent, HotkeyListener};
use crate::paste::PasteClient;
use crate::pipeline::Pipeline;
use crate::settings::SettingsStore;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("MUMBLE_LOG").unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();

    let settings = SettingsStore::load();
    let (history, history_recovery_message) = open_history_with_recovery();
    let paste_client = PasteClient::start().expect("failed to start paste worker");
    let pipeline = Arc::new(Pipeline::new(
        history.clone(),
        settings.clone(),
        paste_client.clone(),
    ));

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
        .manage(crate::download::ActiveDownload::default())
        .setup({
            let settings = settings.clone();
            let pipeline = pipeline.clone();
            let recovery_message = history_recovery_message.clone();
            move |app| {
                // 0. point ort at a modern onnxruntime.dll for the cleanup
                //    model, kept separate from the old runtime sherpa bundles.
                //    must run before any ort use. prod resolves the bundled
                //    resource; dev falls back to the manifest copy.
                if std::env::var_os("ORT_DYLIB_PATH").is_none() {
                    let dll = app
                        .path()
                        .resolve(
                            "resources/onnxruntime.dll",
                            tauri::path::BaseDirectory::Resource,
                        )
                        .ok()
                        .filter(|p| p.exists())
                        .unwrap_or_else(|| {
                            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                                .join("resources/onnxruntime.dll")
                        });
                    std::env::set_var("ORT_DYLIB_PATH", &dll);
                    tracing::info!(dll = %dll.display(), "ort dylib path set");
                }

                // 1. build the tray icon.
                if let Err(e) = tray::build(app.handle()) {
                    tracing::error!(?e, "failed to build tray");
                }

                // surface the history db recovery banner to the ui if open
                // failed and we fell back to a tagged in memory store.
                if let Some(msg) = recovery_message.as_ref() {
                    let _ = app.handle().emit(
                        "mumble://error",
                        serde_json::json!({
                            "kind": "history-db",
                            "recoverable": true,
                            "message": msg,
                        }),
                    );
                }

                // 2. hide main window if user prefers start minimized.
                if settings.get().start_minimized {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }

                // 3. indicator window. hidden at launch and click through set
                //    once (bug fix. was previously reapplied on every press).
                //    we also stamp WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW on the
                //    raw hwnd so showing the indicator never steals foreground
                //    from the user's typing target.
                if let Some(win) = app.get_webview_window("indicator") {
                    let _ = win.hide();
                    let _ = win.set_ignore_cursor_events(true);
                    #[cfg(windows)]
                    if let Err(e) = apply_indicator_window_styles(&win) {
                        tracing::warn!(?e, "indicator WS_EX_NOACTIVATE apply failed");
                    }
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
                //
                // press and release are serialized through a single mpsc
                // bounded channel drained by one dispatcher thread. that
                // guarantees ordering, so a release never races ahead of
                // its own press into the pipeline, and rdev's hook stays
                // unblocked because send is constant time. the dispatcher
                // calls into pipeline synchronously.
                let app_handle = app.handle().clone();
                let pipeline_for_hotkey = pipeline.clone();
                // unbounded so the rdev hook never blocks AND press/release are
                // never dropped. dropping events (the old sync_channel(16) +
                // try_send) desynced the state machine: a dropped Release left
                // the pipeline stuck in Recording until the 30s watchdog, so the
                // next press read as "not Idle, ignoring" and the hotkey looked
                // dead. crossbeam's Sender is Send+Sync, so it satisfies the
                // rdev callback bound that std::sync::mpsc's unbounded Sender
                // does not.
                let (hotkey_tx, hotkey_rx) = crossbeam_channel::unbounded::<HotkeyEvent>();
                thread::Builder::new()
                    .name("mumble-hotkey-dispatch".into())
                    .spawn(move || {
                        while let Ok(evt) = hotkey_rx.recv() {
                            match evt {
                                HotkeyEvent::Pressed => {
                                    pipeline_for_hotkey.on_hotkey_press(&app_handle)
                                }
                                HotkeyEvent::Released => {
                                    pipeline_for_hotkey.on_hotkey_release(&app_handle)
                                }
                            }
                        }
                    })
                    .expect("spawn hotkey dispatcher thread");

                let app_handle_for_died = app.handle().clone();
                let listener = HotkeyListener::spawn(
                    settings.get().hotkey,
                    move |evt| {
                        // unbounded send never blocks the global keyboard hook
                        // and never drops, so press/release stay paired and the
                        // state machine never desyncs. an error here only means
                        // the dispatcher receiver is gone (app shutting down).
                        if let Err(e) = hotkey_tx.send(evt) {
                            tracing::warn!(?e, "hotkey receiver gone, dropping event");
                        }
                    },
                    move || {
                        // fired once on the first hook death so the ui can
                        // banner the user. the listener thread keeps trying
                        // to reinstall the hook in the background.
                        let _ = app_handle_for_died.emit(
                            "mumble://hotkey-died",
                            serde_json::json!({
                                "message": "global hotkey hook crashed, attempting to restart",
                            }),
                        );
                    },
                );
                app.manage(listener);

                // 6. load the transcriber in the background. may download
                //    the model on first run, which takes time.
                let app_handle = app.handle().clone();
                let pipeline_for_load = pipeline.clone();
                tauri::async_runtime::spawn(async move {
                    // remove any parakeet assets a pre subfolder build left at
                    // the root of models/, then fetch into models/parakeet/.
                    if let Ok(root) = paths::models_dir() {
                        if let Err(e) = model_download::purge_legacy_root_assets(&root) {
                            tracing::warn!(?e, "purge legacy root assets failed");
                        }
                    }
                    let dir = match paths::parakeet_dir() {
                        Ok(d) => d,
                        Err(e) => {
                            tracing::error!(?e, "parakeet_dir failed");
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
                    // transcribe::load drops onto sherpa onnx init which
                    // blocks for a couple of seconds while it loads the
                    // model weights. push it off the tokio worker so the
                    // async runtime is not stalled.
                    let loaded =
                        tauri::async_runtime::spawn_blocking(move || transcribe::load(dir)).await;
                    match loaded {
                        Ok(Ok(t)) => {
                            let t: Arc<dyn transcribe::Transcriber> = Arc::from(t);
                            pipeline_for_load.set_transcriber(t);
                            let _ = app_handle
                                .emit("mumble://ready", serde_json::json!({ "ready": true }));
                        }
                        Ok(Err(e)) => {
                            tracing::error!(?e, "transcriber init failed");
                            let _ = app_handle.emit(
                                "mumble://error",
                                serde_json::json!({
                                    "message": format!("transcriber init failed: {e}")
                                }),
                            );
                        }
                        Err(e) => {
                            tracing::error!(?e, "transcriber init task join failed");
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
            commands::get_meter,
            commands::list_history,
            commands::delete_transcript,
            commands::copy_transcript,
            commands::repaste_transcript,
            commands::download_parakeet_model,
            commands::model_status,
            commands::cleanup_status,
            commands::download_cleanup_model,
            commands::cancel_cleanup_download,
            commands::delete_cleanup_model,
            commands::reveal_models_dir,
            commands::get_insights,
            commands::get_app_icon,
            commands::list_dictionary,
            commands::add_dictionary_entry,
            commands::delete_dictionary_entry,
            commands::update_transcript,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// stamp `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` onto the indicator window's
/// extended style. `WS_EX_NOACTIVATE` is the one that actually matters for
/// paste correctness, it tells windows not to give us focus when we show
/// the window. `WS_EX_TOOLWINDOW` hides the indicator from the alt+tab list.
#[cfg(windows)]
fn apply_indicator_window_styles(win: &tauri::WebviewWindow) -> anyhow::Result<()> {
    let raw = win.hwnd().map_err(|e| anyhow::anyhow!("hwnd: {e}"))?;
    let hwnd = HWND(raw.0);
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let updated = current | (WS_EX_NOACTIVATE.0 as isize) | (WS_EX_TOOLWINDOW.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated);
    }
    Ok(())
}

/// open the history db, recovering from corruption rather than crashing.
///
/// the on disk file can get torn on power loss or runaway disk corruption.
/// rather than crashing the whole app, rename the bad file aside, retry
/// once, and as a last resort fall back to an in memory store so the user
/// can still dictate (history will not persist until the file is fixed).
/// returns the store plus an optional recovery message the ui can banner.
fn open_history_with_recovery() -> (HistoryStore, Option<String>) {
    match HistoryStore::open() {
        Ok(store) => (store, None),
        Err(first_err) => {
            let path = match crate::paths::history_db_path() {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!(?e, "history_db_path failed during recovery");
                    let store = HistoryStore::open_in_memory()
                        .expect("in memory history store init failed");
                    return (store, Some(format!("history db unavailable: {e}")));
                }
            };
            tracing::error!(
                ?first_err,
                path = %path.display(),
                "failed to open history.db, attempting recovery"
            );

            let unix_ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let bak = path.with_extension(format!("db.bak.{unix_ts}"));
            if let Err(e) = std::fs::rename(&path, &bak) {
                tracing::warn!(?e, dst = %bak.display(), "rename to .bak failed");
            }

            match HistoryStore::open() {
                Ok(store) => {
                    let msg = format!(
                        "history.db was corrupt and has been moved to {}. a fresh history was created.",
                        bak.display()
                    );
                    tracing::warn!(%msg, "history db recovered with fresh file");
                    (store, Some(msg))
                }
                Err(second_err) => {
                    tracing::error!(
                        ?second_err,
                        "history.db retry failed, falling back to in memory store"
                    );
                    let store = HistoryStore::open_in_memory()
                        .expect("in memory history store init failed");
                    let msg = format!(
                        "history is running in memory only, on disk db failed: {second_err}"
                    );
                    (store, Some(msg))
                }
            }
        }
    }
}
