//! Clipboard-snapshot + Ctrl+V paste.
//!
//! Mirrors Hex's PasteboardClient:
//!   1. Snapshot the user's current clipboard text.
//!   2. Write our transcript to the clipboard.
//!   3. Synthesise Ctrl+V with `enigo` (SendInput under the hood).
//!   4. Wait ~120 ms for the target app to consume it.
//!   5. Restore the original clipboard contents.
//!
//! If the user had non-text clipboard data (image, file), we can only restore
//! text; in that case we clear the clipboard rather than leaving our transcript
//! stuck there.

use anyhow::{Context, Result};
use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn paste_text(text: &str) -> Result<()> {
    let mut cb = Clipboard::new().context("open clipboard")?;
    let previous = cb.get_text().ok();

    cb.set_text(text.to_string())
        .context("write transcript to clipboard")?;
    // Give Windows a beat to actually stage the new clipboard contents before
    // we fire the keystroke.
    thread::sleep(Duration::from_millis(40));

    synth_ctrl_v().context("synth Ctrl+V")?;

    // Wait for the target app to read the clipboard.
    thread::sleep(Duration::from_millis(150));

    match previous {
        Some(prev) => {
            cb.set_text(prev).ok();
        }
        None => {
            cb.clear().ok();
        }
    }
    Ok(())
}

fn synth_ctrl_v() -> Result<()> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| anyhow::anyhow!("{e}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(())
}
