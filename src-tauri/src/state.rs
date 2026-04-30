use serde::Serialize;
use std::sync::atomic::{AtomicU8, Ordering};

/// High-level app state, shared across the backend.
///
/// Transitions are linear:
///   Idle -> Recording -> Transcribing -> Pasting -> Idle
///
/// A bad-hotkey press or a sub-threshold clip short-circuits back to Idle.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppState {
    Idle = 0,
    Recording = 1,
    Transcribing = 2,
    Pasting = 3,
    Paused = 4,
}

impl AppState {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => AppState::Recording,
            2 => AppState::Transcribing,
            3 => AppState::Pasting,
            4 => AppState::Paused,
            _ => AppState::Idle,
        }
    }
}

/// Lock-free state holder — hotkey thread reads, worker writes.
pub struct SharedState {
    inner: AtomicU8,
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            inner: AtomicU8::new(AppState::Idle as u8),
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
