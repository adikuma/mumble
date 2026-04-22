//! Global push-to-talk hotkey listener.
//!
//! Uses `rdev` to grab raw key-down / key-up events system-wide (backed by
//! `SetWindowsHookExW(WH_KEYBOARD_LL)` on Windows). Unlike a combo-based global
//! shortcut plugin, we need *both* press and release to drive the hold-to-talk
//! flow.

use parking_lot::RwLock;
use rdev::{listen, Event, EventType, Key};
use std::sync::Arc;
use std::thread;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HotkeyEvent {
    Pressed,
    Released,
}

#[derive(Clone)]
pub struct HotkeyListener {
    binding: Arc<RwLock<String>>,
}

impl HotkeyListener {
    pub fn spawn<F>(initial_binding: String, on_event: F) -> Self
    where
        F: Fn(HotkeyEvent) + Send + Sync + 'static,
    {
        let binding = Arc::new(RwLock::new(initial_binding));
        let cb_binding = Arc::clone(&binding);
        let cb = Arc::new(on_event);
        let is_down = Arc::new(parking_lot::Mutex::new(false));

        thread::spawn(move || {
            let result = listen(move |event: Event| {
                let wanted = cb_binding.read().clone();
                let Some(target) = key_from_name(&wanted) else {
                    return;
                };
                match event.event_type {
                    EventType::KeyPress(k) if k == target => {
                        let mut dn = is_down.lock();
                        if !*dn {
                            *dn = true;
                            drop(dn);
                            cb(HotkeyEvent::Pressed);
                        }
                    }
                    EventType::KeyRelease(k) if k == target => {
                        let mut dn = is_down.lock();
                        if *dn {
                            *dn = false;
                            drop(dn);
                            cb(HotkeyEvent::Released);
                        }
                    }
                    _ => {}
                }
            });
            if let Err(e) = result {
                tracing::error!(?e, "hotkey listener exited");
            }
        });

        Self { binding }
    }

    pub fn rebind(&self, next: String) {
        *self.binding.write() = next;
    }
}

/// Map a user-facing hotkey name (e.g. "RightCtrl", "F13", "CapsLock") to rdev::Key.
pub fn key_from_name(name: &str) -> Option<Key> {
    let n = name.trim();
    let lower = n.to_ascii_lowercase();
    Some(match lower.as_str() {
        "leftctrl" | "lctrl" | "controlleft" => Key::ControlLeft,
        "rightctrl" | "rctrl" | "controlright" => Key::ControlRight,
        "leftalt" | "lalt" | "altleft" => Key::Alt,
        "rightalt" | "ralt" | "altright" | "altgr" => Key::AltGr,
        "leftshift" | "lshift" | "shiftleft" => Key::ShiftLeft,
        "rightshift" | "rshift" | "shiftright" => Key::ShiftRight,
        "leftmeta" | "lmeta" | "metaleft" | "lwin" | "win" => Key::MetaLeft,
        "rightmeta" | "rmeta" | "metaright" | "rwin" => Key::MetaRight,
        "capslock" | "caps" => Key::CapsLock,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        "space" => Key::Space,
        "tab" => Key::Tab,
        "backspace" => Key::Backspace,
        "escape" | "esc" => Key::Escape,
        _ => return None,
    })
}

/// Convert a raw `rdev::Key` back into the canonical name we persist.
pub fn name_from_key(key: Key) -> Option<&'static str> {
    Some(match key {
        Key::ControlLeft => "LeftCtrl",
        Key::ControlRight => "RightCtrl",
        Key::Alt => "LeftAlt",
        Key::AltGr => "RightAlt",
        Key::ShiftLeft => "LeftShift",
        Key::ShiftRight => "RightShift",
        Key::MetaLeft => "LeftMeta",
        Key::MetaRight => "RightMeta",
        Key::CapsLock => "CapsLock",
        Key::F1 => "F1",
        Key::F2 => "F2",
        Key::F3 => "F3",
        Key::F4 => "F4",
        Key::F5 => "F5",
        Key::F6 => "F6",
        Key::F7 => "F7",
        Key::F8 => "F8",
        Key::F9 => "F9",
        Key::F10 => "F10",
        Key::F11 => "F11",
        Key::F12 => "F12",
        Key::Space => "Space",
        Key::Tab => "Tab",
        Key::Backspace => "Backspace",
        Key::Escape => "Escape",
        _ => return None,
    })
}

/// One-shot capture: returns the name of the next key pressed, or None on error.
/// Blocks the calling thread, so callers should run it on a dedicated thread.
pub fn capture_next_key() -> Option<String> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();
    let tx = std::sync::Mutex::new(Some(tx));
    thread::spawn(move || {
        let _ = listen(move |e| {
            if let EventType::KeyPress(k) = e.event_type {
                if let Some(name) = name_from_key(k) {
                    if let Ok(mut guard) = tx.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(name.to_string());
                        }
                    }
                }
            }
        });
    });
    rx.recv_timeout(std::time::Duration::from_secs(30)).ok()
}
