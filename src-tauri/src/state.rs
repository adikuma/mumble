use serde::Serialize;
use std::sync::atomic::{AtomicU8, Ordering};

/// high level app state, shared across the backend.
///
/// transitions are linear:
///   idle then recording then transcribing then pasting then idle
///
/// an unrecognised hotkey press or a sub threshold clip short circuits back
/// to idle. "paused" is a settings field, not a state. when paused, hotkey
/// presses are ignored but the state machine stays idle.
#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppState {
    Idle = 0,
    Recording = 1,
    Transcribing = 2,
    Pasting = 3,
}

impl AppState {
    fn from_u8(v: u8) -> Self {
        // the variants are numbered 0..=3 and we never store anything else
        // via `set`. catching an out of range value in debug guards against
        // a future change to the enum that forgets to update this match.
        debug_assert!(v <= 3, "AppState::from_u8 out of range: {v}");
        match v {
            1 => AppState::Recording,
            2 => AppState::Transcribing,
            3 => AppState::Pasting,
            _ => AppState::Idle,
        }
    }
}

/// lock free state holder. hotkey thread reads, worker writes.
pub struct SharedState {
    inner: AtomicU8,
    pub icon_cache: crate::app_icons::IconCache,
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            inner: AtomicU8::new(AppState::Idle as u8),
            icon_cache: crate::app_icons::IconCache::new(),
        }
    }

    pub fn get(&self) -> AppState {
        AppState::from_u8(self.inner.load(Ordering::Acquire))
    }

    pub fn set(&self, next: AppState) {
        self.inner.store(next as u8, Ordering::Release);
    }

    pub fn compare_set(&self, expected: AppState, next: AppState) -> bool {
        self.inner
            .compare_exchange(
                expected as u8,
                next as u8,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }
}

impl Default for SharedState {
    fn default() -> Self {
        Self::new()
    }
}
