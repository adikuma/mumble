//! clipboard write and `Ctrl+V` paste.
//!
//! mirrors hex's pasteboardclient (`Hex/Clients/PasteboardClient.swift` in the
//! cloned reference) when auto_paste is on:
//!   1. snapshot the user's current clipboard text.
//!   2. write our transcript to the clipboard.
//!   3. synthesise `Ctrl+V` with `enigo` (sendinput under the hood).
//!   4. wait ~150 ms for the target app to consume it.
//!   5. restore the original clipboard contents.
//!
//! when auto_paste is off, only step 2 runs. the transcript is left in the
//! clipboard so the user can paste manually with `Ctrl+V` wherever they want.

use anyhow::{Context, Result};
use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

/// full hex style flow. snapshot, write, `Ctrl+V`, restore.
pub fn paste_text(text: &str) -> Result<()> {
    let mut cb = Clipboard::new().context("open clipboard")?;
    let previous = cb.get_text().ok();

    cb.set_text(text.to_string())
        .context("write transcript to clipboard")?;
    // give windows a beat to actually stage the new clipboard contents before
    // we fire the keystroke.
    thread::sleep(Duration::from_millis(40));

    synth_ctrl_v().context("synth Ctrl+V")?;

    // wait for the target app to read the clipboard.
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

/// just write to the clipboard. no keystroke, no restore. the transcript
/// stays in the clipboard until the user pastes it manually or copies
/// something else.
pub fn copy_only(text: &str) -> Result<()> {
    let mut cb = Clipboard::new().context("open clipboard")?;
    cb.set_text(text.to_string())
        .context("write transcript to clipboard")?;
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
