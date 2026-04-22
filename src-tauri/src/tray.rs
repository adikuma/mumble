//! System tray icon + menu.
//!
//! Left-click toggles the main window. Right-click opens a menu with
//! Open / Pause-Resume / Quit. The icon itself is static in v1; state
//! indication is delegated to the floating indicator window.

use anyhow::Result;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::SettingsStore;

pub fn build(app: &AppHandle) -> Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Mumble", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "toggle_pause", "Pause dictation", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mumble", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &sep, &quit])?;

    TrayIconBuilder::with_id("mumble-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Mumble — hold your hotkey to dictate")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_main_window(app),
            "quit" => app.exit(0),
            "toggle_pause" => toggle_pause(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn open_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn toggle_pause(app: &AppHandle) {
    if let Some(store) = app.try_state::<SettingsStore>() {
        let next = !store.get().paused;
        let _ = store.update(|s| s.paused = next);
        let _ = app.emit(
            "mumble://settings-changed",
            serde_json::json!({ "paused": next }),
        );
    }
}
