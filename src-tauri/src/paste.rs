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
//!
//! the streaming path (chunked transcription) calls `snapshot_clipboard` once
//! at the top, `paste_chunk` per chunk as transcripts arrive, and
//! `restore_clipboard` once at the bottom. each `paste_chunk` advances the
//! caret by writing into the clipboard then synthesising `Ctrl+V`, leaving the
//! transcript text in the clipboard between chunks (intentional, the next
//! chunk overwrites it). the final restore puts the user's original clipboard
//! back so they don't notice mumble was there.

use anyhow::{Context, Result};
use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

/// snapshot the user's current clipboard text. call once before a streaming
/// session so we can put the original contents back at the end.
pub fn snapshot_clipboard() -> Option<String> {
    Clipboard::new().ok()?.get_text().ok()
}

/// write a single chunk to the clipboard and fire `Ctrl+V`. does not restore
/// the clipboard. the caller restores once after every chunk has pasted.
///
/// if `leading_space` is true, a single space is prepended so streaming
/// chunks join cleanly (`hello world` + ` how are you`).
pub fn paste_chunk(text: &str, leading_space: bool) -> Result<()> {
    let mut cb = Clipboard::new().context("open clipboard")?;
    let payload = if leading_space {
        format!(" {}", text)
    } else {
        text.to_string()
    };
    cb.set_text(payload)
        .context("write chunk to clipboard")?;
    // give windows a beat to actually stage the new clipboard contents before
    // we fire the keystroke.
    thread::sleep(Duration::from_millis(40));
    synth_ctrl_v().context("synth Ctrl+V")?;
    // wait for the target app to read the clipboard. shorter than the one
    // shot path because the next chunk (or the restore) is right behind us.
    thread::sleep(Duration::from_millis(80));
    Ok(())
}

/// put the user's original clipboard text back. call once at the end of a
/// streaming session. if the original was empty / unreadable we just clear.
pub fn restore_clipboard(prior: Option<String>) -> Result<()> {
    let mut cb = Clipboard::new().context("open clipboard")?;
    match prior {
        Some(prev) => {
            cb.set_text(prev).ok();
        }
        None => {
            cb.clear().ok();
        }
    }
    Ok(())
}

/// full hex style flow. snapshot, write, `Ctrl+V`, restore.
///
/// thin wrapper around the chunk primitives so non streaming callers (e.g.
/// `commands::repaste_transcript` for the history "paste again" action) keep
/// the original behaviour without changes at the call site.
pub fn paste_text(text: &str) -> Result<()> {
    let prior = snapshot_clipboard();
    paste_chunk(text, false)?;
    // a touch more dwell time before restoring so slow apps finish reading.
    thread::sleep(Duration::from_millis(70));
    restore_clipboard(prior)?;
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
