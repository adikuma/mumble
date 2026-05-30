//! system tray icon and menu.
//!
//! left click toggles the main window. right click opens a menu with
//! open, pause or resume, quit. the icon itself is static in v1. state
//! indication is delegated to the floating indicator window.

use anyhow::Result;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::SettingsStore;

// tray menu item ids and labels. hoisted to consts so the strings are not
// repeated across the build closure and the event handler match.
const TRAY_ID: &str = "mumble-tray";
const TRAY_TOOLTIP: &str = "Mumble: hold your hotkey to dictate";
const ID_OPEN: &str = "open";
const ID_TOGGLE_PAUSE: &str = "toggle_pause";
const ID_QUIT: &str = "quit";
const LABEL_OPEN: &str = "Open Mumble";
const LABEL_TOGGLE_PAUSE: &str = "Pause dictation";
const LABEL_QUIT: &str = "Quit Mumble";

pub fn build(app: &AppHandle) -> Result<()> {
    let open = MenuItem::with_id(app, ID_OPEN, LABEL_OPEN, true, None::<&str>)?;
    let pause = MenuItem::with_id(app, ID_TOGGLE_PAUSE, LABEL_TOGGLE_PAUSE, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, ID_QUIT, LABEL_QUIT, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &sep, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(TRAY_TOOLTIP)
        .on_menu_event(|app, event| match event.id.as_ref() {
            ID_OPEN => open_main_window(app),
            ID_QUIT => app.exit(0),
            ID_TOGGLE_PAUSE => toggle_pause(app),
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
