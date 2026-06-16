use serde::Serialize;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};

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
        // walk every variant and compare against its own discriminant. the
        // exhaustive match in all_variants() means adding a new variant is a
        // compile error there, so this can never silently alias an unknown
        // value to idle. behavior for the valid 0..=3 values is unchanged.
        debug_assert!(v <= 3, "AppState::from_u8 out of range: {v}");
        AppState::all_variants()
            .into_iter()
            .find(|state| v == *state as u8)
            .unwrap_or(AppState::Idle)
    }

    /// the full set of variants. the exhaustive match (no wildcard arm) forces
    /// a compile error when a variant is added or removed, which keeps from_u8
    /// honest. the match value is unused beyond proving completeness.
    fn all_variants() -> [AppState; 4] {
        match AppState::Idle {
            AppState::Idle | AppState::Recording | AppState::Transcribing | AppState::Pasting => {}
        }
        [
            AppState::Idle,
            AppState::Recording,
            AppState::Transcribing,
            AppState::Pasting,
        ]
    }
}

/// lock free state holder. hotkey thread reads, worker writes.
pub struct SharedState {
    inner: AtomicU8,
    /// bumped on every new recording session so a stale watchdog armed by an
    /// earlier session cannot reset a later one.
    generation: AtomicU64,
    pub icon_cache: crate::app_icons::IconCache,
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            inner: AtomicU8::new(AppState::Idle as u8),
            generation: AtomicU64::new(0),
            icon_cache: crate::app_icons::IconCache::new(),
        }
    }

    pub fn get(&self) -> AppState {
        AppState::from_u8(self.inner.load(Ordering::Acquire))
    }

    pub fn set(&self, next: AppState) {
        self.inner.store(next as u8, Ordering::Release);
    }

    /// bump and return the new session generation. called on each idle to
    /// recording transition.
    pub fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::AcqRel) + 1
    }

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
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
