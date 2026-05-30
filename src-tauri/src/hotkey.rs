//! global push to talk hotkey listener.
//!
//! uses `rdev` to grab raw key down and key up events system wide (backed by
//! `SetWindowsHookEx(WH_KEYBOARD_LL)` on windows). unlike a combo based global
//! shortcut plugin, we need both press and release to drive the hold to talk
//! flow.
//!
//! architecture. one `rdev::listen` thread total. rdev on windows does not
//! support multiple concurrent `listen` calls. a second call hangs or returns
//! silently. so instead of spawning a fresh listener for each "change hotkey"
//! capture, the single existing listener has a capture mode flag. while the
//! flag is set, the next `KeyPress` is routed to a channel. otherwise events
//! are filtered against the configured binding as usual.

use parking_lot::{Mutex, RwLock};
use rdev::{listen, Event, EventType, Key};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HotkeyEvent {
    Pressed,
    Released,
}

#[derive(Clone)]
pub struct HotkeyListener {
    binding: Arc<RwLock<String>>,
    capture: Arc<Mutex<Option<mpsc::Sender<String>>>>,
}

impl HotkeyListener {
    pub fn spawn<F, D>(initial_binding: String, on_event: F, on_died: D) -> Self
    where
        F: Fn(HotkeyEvent) + Send + Sync + 'static,
        D: Fn() + Send + Sync + 'static,
    {
        let binding = Arc::new(RwLock::new(initial_binding));
        let capture: Arc<Mutex<Option<mpsc::Sender<String>>>> = Arc::new(Mutex::new(None));
        let cb_binding = Arc::clone(&binding);
        let cb_capture = Arc::clone(&capture);
        let cb = Arc::new(on_event);
        let on_died = Arc::new(on_died);
        let is_down = Arc::new(Mutex::new(false));

        thread::spawn(move || {
            tracing::info!("hotkey listener thread started, installing global hook");
            // restart loop. rdev::listen blocks for the lifetime of the
            // hook. if it ever returns, the global hook is dead, the user
            // can no longer talk to mumble. sleep briefly to avoid a tight
            // crash loop, fire on_died once on the first crash so the ui
            // can banner the user, then try again.
            let mut died_notified = false;
            loop {
                let cb = Arc::clone(&cb);
                let cb_binding = Arc::clone(&cb_binding);
                let cb_capture = Arc::clone(&cb_capture);
                let is_down = Arc::clone(&is_down);
                let result = listen(move |event: Event| {
                    // wrap the entire callback in catch_unwind. rdev calls into
                    // us from the os keyboard hook thread on windows, a panic
                    // here would unwind across the ffi boundary and abort the
                    // process. swallowing it and logging keeps the global hook
                    // alive at the cost of dropping the offending event.
                    let outcome = catch_unwind(AssertUnwindSafe(|| {
                        handle_hotkey_event(&event, &cb_binding, &cb_capture, &is_down, &cb);
                    }));
                    if outcome.is_err() {
                        tracing::error!("hotkey callback panicked, dropping event");
                    }
                });
                if let Err(e) = result {
                    tracing::error!(?e, "hotkey listener exited, global hook is dead");
                } else {
                    tracing::warn!("hotkey listener returned cleanly, global hook is dead");
                }
                if !died_notified {
                    died_notified = true;
                    on_died();
                }
                thread::sleep(Duration::from_millis(500));
            }
        });

        Self { binding, capture }
    }

    pub fn rebind(&self, next: String) {
        *self.binding.write() = next;
    }

    /// block up to 30 seconds for the next key press, observed by the existing
    /// listener thread. returns the canonical key name on success.
    pub fn capture_next(&self) -> Option<String> {
        let (tx, rx) = mpsc::channel();
        *self.capture.lock() = Some(tx);
        let result = rx.recv_timeout(Duration::from_secs(30)).ok();
        // always clear the capture sender even on success so we never get
        // stuck capturing forever if a stray sender lingered.
        *self.capture.lock() = None;
        result
    }
}

/// route a single rdev event. extracted from the listen closure so the
/// catch_unwind boundary is over a clean function call.
fn handle_hotkey_event<F>(
    event: &Event,
    binding: &Arc<RwLock<String>>,
    capture: &Arc<Mutex<Option<mpsc::Sender<String>>>>,
    is_down: &Arc<Mutex<bool>>,
    cb: &Arc<F>,
) where
    F: Fn(HotkeyEvent) + Send + Sync + 'static,
{
    // capture mode takes priority. the next key press is routed to
    // the waiting `capture_next` caller instead of being matched
    // against the configured hotkey.
    if let EventType::KeyPress(k) = event.event_type {
        let mut guard = capture.lock();
        if let Some(sender) = guard.take() {
            if let Some(name) = name_from_key(k) {
                tracing::info!(name, "capture_next received key");
                let _ = sender.send(name.to_string());
            } else {
                // unknown key. put the sender back so the next
                // press can try again instead of timing out.
                *guard = Some(sender);
            }
            return;
        }
    }

    let wanted = binding.read().clone();
    let Some(target) = key_from_name(&wanted) else {
        return;
    };
    match event.event_type {
        EventType::KeyPress(k) if k == target => {
            let mut dn = is_down.lock();
            if !*dn {
                *dn = true;
                drop(dn);
                tracing::info!(?k, "hotkey pressed");
                cb(HotkeyEvent::Pressed);
            }
        }
        EventType::KeyRelease(k) if k == target => {
            let mut dn = is_down.lock();
            if *dn {
                *dn = false;
                drop(dn);
                tracing::info!(?k, "hotkey released");
                cb(HotkeyEvent::Released);
            }
        }
        _ => {}
    }
}

/// map a user facing hotkey name (e.g. `RightAlt`, `F8`, `CapsLock`) to `rdev::Key`.
pub fn key_from_name(name: &str) -> Option<Key> {
    let n = name.trim();
    let lower = n.to_ascii_lowercase();
    Some(match lower.as_str() {
        "leftctrl" | "lctrl" | "controlleft" => Key::ControlLeft,
        "rightctrl" | "rctrl" | "controlright" => Key::ControlRight,
        "leftalt" | "lalt" | "altleft" | "alt" => Key::Alt,
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

/// convert a raw `rdev::Key` back into the canonical name we persist.
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
