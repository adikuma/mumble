//! clipboard write and `Ctrl+V` paste.
//!
//! mirrors hex's pasteboardclient (`Hex/Clients/PasteboardClient.swift` in the
//! cloned reference) when auto_paste is on:
//!   1. snapshot the user's current clipboard text.
//!   2. write our transcript to the clipboard.
//!   3. synthesise `Ctrl+V` via raw `SendInput` with scancodes.
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
//!
//! threading. clipboard apis and `SendInput` are both com sta affine on
//! windows. arboard wraps `OleSetClipboard`, the desktop input queue cares
//! about which thread you called from, and several apps refuse paste if the
//! foreground thread differs from the one that wrote the clipboard. so we
//! spawn one long lived `PasteWorker` thread on app start, call
//! `CoInitializeEx(APARTMENTTHREADED)` once on it, and route every clipboard
//! plus `SendInput` operation through it via a `crossbeam-channel`.

use anyhow::{Context, Result};
use arboard::Clipboard;
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use parking_lot::Mutex;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use windows::core::HSTRING;
#[cfg(windows)]
use windows::Win32::Foundation::{HANDLE, HWND};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{
    CloseClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
#[cfg(windows)]
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    KEYEVENTF_SCANCODE, VIRTUAL_KEY,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, ASFW_ANY,
};

/// `CF_PRIVATEFIRST` per windows clipboard format reserved range. writing
/// any entry under this format with a null handle signals to clipboard
/// history (and similar monitors) that the current clipboard contents are
/// app private and should not be retained.
#[cfg(windows)]
const CF_PRIVATEFIRST: u32 = 0x0200;

/// stage delay after writing the clipboard and before synthesising the
/// keystroke. windows needs a beat to finish staging the clipboard data.
const PASTE_STAGE_DELAY_MS: u64 = 40;
/// dwell time after the keystroke before we move on, so the target app has
/// a chance to read the clipboard before the next chunk overwrites it.
const PASTE_DWELL_MS: u64 = 80;
/// extra guard time before restoring the original clipboard at the end of
/// the one shot path, to handle slower apps.
const PASTE_RESTORE_GUARD_MS: u64 = 70;
/// scancodes used for the synthetic ctrl plus v. set 1 scancodes, the
/// `KEYEVENTF_SCANCODE` flag makes windows translate via the user's layout.
const SCANCODE_CONTROL: u16 = 0x1D;
const SCANCODE_V: u16 = 0x2F;
/// retry budget for transient `OpenClipboard` and `SetForegroundWindow`
/// failures. windows briefly refuses clipboard access when another app is
/// currently holding it, and `SetForegroundWindow` can race with the user.
const CLIPBOARD_RETRIES: u32 = 5;
const FOCUS_RETRIES: u32 = 5;
const RETRY_BACKOFF_MS: u64 = 10;

/// jobs accepted by the paste worker. each variant carries the reply
/// channel the worker uses to deliver the outcome. the worker never sleeps
/// on shared state, every interaction goes through these messages.
enum PasteJob {
    Snapshot {
        reply: Sender<Option<String>>,
    },
    PasteChunk {
        text: String,
        leading_space: bool,
        target_hwnd: isize,
        reply: Sender<Result<()>>,
    },
    Restore {
        prior: Option<String>,
        reply: Sender<Result<()>>,
    },
    PasteText {
        text: String,
        reply: Sender<Result<()>>,
    },
    CopyOnly {
        text: String,
        reply: Sender<Result<()>>,
    },
    FocusTarget {
        hwnd_isize: isize,
        reply: Sender<Result<()>>,
    },
    Shutdown,
}

/// cheaply cloneable handle to the paste worker. every clone refers to the
/// same backing thread. dropping the final handle joins the worker.
#[derive(Clone)]
pub struct PasteClient {
    inner: Arc<PasteClientInner>,
}

struct PasteClientInner {
    tx: Sender<PasteJob>,
    join: Mutex<Option<thread::JoinHandle<()>>>,
}

impl Drop for PasteClientInner {
    fn drop(&mut self) {
        let _ = self.tx.send(PasteJob::Shutdown);
        if let Some(handle) = self.join.lock().take() {
            let _ = handle.join();
        }
    }
}

impl PasteClient {
    /// spawn the worker thread. fails only if the os refuses to create the
    /// thread, which would already mean the app is in serious trouble.
    pub fn start() -> Result<Self> {
        let (tx, rx) = unbounded::<PasteJob>();
        let join = thread::Builder::new()
            .name("mumble-paste".into())
            .spawn(move || {
                init_com_sta();
                run_paste_worker(rx);
                uninit_com_sta();
            })
            .context("spawn paste worker thread")?;
        Ok(Self {
            inner: Arc::new(PasteClientInner {
                tx,
                join: Mutex::new(Some(join)),
            }),
        })
    }

    pub fn snapshot_clipboard(&self) -> Option<String> {
        let (tx, rx) = bounded(1);
        if self
            .inner
            .tx
            .send(PasteJob::Snapshot { reply: tx })
            .is_err()
        {
            return None;
        }
        rx.recv().unwrap_or(None)
    }

    pub fn paste_chunk(&self, text: String, leading_space: bool, target_hwnd: isize) -> Result<()> {
        let (tx, rx) = bounded(1);
        self.inner
            .tx
            .send(PasteJob::PasteChunk {
                text,
                leading_space,
                target_hwnd,
                reply: tx,
            })
            .map_err(|_| anyhow::anyhow!("paste worker channel closed"))?;
        rx.recv()
            .map_err(|_| anyhow::anyhow!("paste worker dropped reply"))?
    }

    pub fn restore_clipboard(&self, prior: Option<String>) -> Result<()> {
        let (tx, rx) = bounded(1);
        self.inner
            .tx
            .send(PasteJob::Restore { prior, reply: tx })
            .map_err(|_| anyhow::anyhow!("paste worker channel closed"))?;
        rx.recv()
            .map_err(|_| anyhow::anyhow!("paste worker dropped reply"))?
    }

    pub fn paste_text(&self, text: &str) -> Result<()> {
        let (tx, rx) = bounded(1);
        self.inner
            .tx
            .send(PasteJob::PasteText {
                text: text.to_string(),
                reply: tx,
            })
            .map_err(|_| anyhow::anyhow!("paste worker channel closed"))?;
        rx.recv()
            .map_err(|_| anyhow::anyhow!("paste worker dropped reply"))?
    }

    pub fn copy_only(&self, text: &str) -> Result<()> {
        let (tx, rx) = bounded(1);
        self.inner
            .tx
            .send(PasteJob::CopyOnly {
                text: text.to_string(),
                reply: tx,
            })
            .map_err(|_| anyhow::anyhow!("paste worker channel closed"))?;
        rx.recv()
            .map_err(|_| anyhow::anyhow!("paste worker dropped reply"))?
    }

    pub fn focus_target(&self, hwnd_isize: isize) -> Result<()> {
        let (tx, rx) = bounded(1);
        self.inner
            .tx
            .send(PasteJob::FocusTarget {
                hwnd_isize,
                reply: tx,
            })
            .map_err(|_| anyhow::anyhow!("paste worker channel closed"))?;
        rx.recv()
            .map_err(|_| anyhow::anyhow!("paste worker dropped reply"))?
    }
}

#[cfg(windows)]
fn init_com_sta() {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

#[cfg(not(windows))]
fn init_com_sta() {}

#[cfg(windows)]
fn uninit_com_sta() {
    use windows::Win32::System::Com::CoUninitialize;
    unsafe {
        CoUninitialize();
    }
}

#[cfg(not(windows))]
fn uninit_com_sta() {}

fn run_paste_worker(rx: Receiver<PasteJob>) {
    while let Ok(job) = rx.recv() {
        // break the loop on shutdown so PasteClientInner::drop can join. the
        // sender is still alive at drop time, so recv would otherwise block
        // forever (mirrors CaptureCommand::Shutdown => break in audio.rs).
        if matches!(job, PasteJob::Shutdown) {
            break;
        }
        // every handler is wrapped in catch_unwind so a panic from a single
        // clipboard or sendinput call never tears down the worker thread.
        let result = catch_unwind(AssertUnwindSafe(|| dispatch_job(job)));
        if result.is_err() {
            tracing::error!("paste worker job panicked, continuing");
        }
    }
}

fn dispatch_job(job: PasteJob) {
    match job {
        PasteJob::Snapshot { reply } => {
            let value = snapshot_clipboard_blocking();
            let _ = reply.send(value);
        }
        PasteJob::PasteChunk {
            text,
            leading_space,
            target_hwnd,
            reply,
        } => {
            let result = paste_chunk_blocking(&text, leading_space, target_hwnd);
            let _ = reply.send(result);
        }
        PasteJob::Restore { prior, reply } => {
            let result = restore_clipboard_blocking(prior);
            let _ = reply.send(result);
        }
        PasteJob::PasteText { text, reply } => {
            let result = paste_text_blocking(&text);
            let _ = reply.send(result);
        }
        PasteJob::CopyOnly { text, reply } => {
            let result = copy_only_blocking(&text);
            let _ = reply.send(result);
        }
        PasteJob::FocusTarget { hwnd_isize, reply } => {
            let result = focus_target_blocking(hwnd_isize);
            let _ = reply.send(result);
        }
        PasteJob::Shutdown => {
            // handled in run_paste_worker, which breaks before dispatching.
            // kept for an exhaustive match.
        }
    }
}

/// open the clipboard, retrying briefly on contention. arboard returns an
/// error if windows refuses `OpenClipboard`, which happens any time another
/// process is currently writing to it.
fn open_clipboard_with_retry() -> Result<Clipboard> {
    let mut last_err: Option<arboard::Error> = None;
    for _ in 0..CLIPBOARD_RETRIES {
        match Clipboard::new() {
            Ok(cb) => return Ok(cb),
            Err(e) => {
                last_err = Some(e);
                thread::sleep(Duration::from_millis(RETRY_BACKOFF_MS));
            }
        }
    }
    Err(anyhow::anyhow!(
        "open clipboard: {}",
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown".into())
    ))
}

/// write text into the clipboard, retrying briefly on contention. some apps
/// hold the clipboard open just long enough to make a single `set_text` race.
fn set_clipboard_text_with_retry(cb: &mut Clipboard, text: String) -> Result<()> {
    let mut last_err: Option<arboard::Error> = None;
    for _ in 0..CLIPBOARD_RETRIES {
        match cb.set_text(text.clone()) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                thread::sleep(Duration::from_millis(RETRY_BACKOFF_MS));
            }
        }
    }
    Err(anyhow::anyhow!(
        "set clipboard text: {}",
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown".into())
    ))
}

fn snapshot_clipboard_blocking() -> Option<String> {
    open_clipboard_with_retry().ok()?.get_text().ok()
}

/// mark the current clipboard contents as private so windows clipboard
/// history (and other monitors that respect the reserved private formats)
/// skip logging the transcript. best effort. failures are logged at debug
/// and do not surface as errors because the paste itself already succeeded
/// by the time we get here.
///
/// this writes two markers: the reserved `CF_PRIVATEFIRST` format with a
/// null handle, and a registered `ExcludeClipboardContentFromMonitorProcessing`
/// format, which is the documented opt out for modern clipboard history.
#[cfg(windows)]
fn mark_clipboard_private() {
    unsafe {
        // OpenClipboard with a null window handle takes ownership for this
        // thread. arboard has already closed by this point, but we still
        // retry briefly in case another process is staging an update.
        let mut opened = false;
        for _ in 0..CLIPBOARD_RETRIES {
            if OpenClipboard(HWND(std::ptr::null_mut())).is_ok() {
                opened = true;
                break;
            }
            thread::sleep(Duration::from_millis(RETRY_BACKOFF_MS));
        }
        if !opened {
            tracing::debug!("mark_clipboard_private: OpenClipboard refused");
            return;
        }

        // CF_PRIVATEFIRST with a null handle is enough on its own for some
        // clipboard managers. SetClipboardData treats a null hMem as a
        // delayed render advertisement, so the format is published without
        // any actual payload.
        let _ = SetClipboardData(CF_PRIVATEFIRST, HANDLE(std::ptr::null_mut()));

        // the documented exclusion format. registering it lazily here is
        // cheap and idempotent across calls.
        let name = HSTRING::from("ExcludeClipboardContentFromMonitorProcessing");
        let fmt = RegisterClipboardFormatW(&name);
        if fmt != 0 {
            let _ = SetClipboardData(fmt, HANDLE(std::ptr::null_mut()));
        }

        let _ = CloseClipboard();
    }
}

#[cfg(not(windows))]
fn mark_clipboard_private() {}

fn paste_chunk_blocking(text: &str, leading_space: bool, target_hwnd: isize) -> Result<()> {
    let mut cb = open_clipboard_with_retry().context("open clipboard")?;
    let payload = if leading_space {
        format!(" {}", text)
    } else {
        text.to_string()
    };
    set_clipboard_text_with_retry(&mut cb, payload).context("write chunk to clipboard")?;
    // drop the arboard handle so the clipboard is closed before we re open
    // it from raw win32 to publish the private format markers.
    drop(cb);
    mark_clipboard_private();
    tracing::debug!("paste: clipboard staged");
    // give windows a beat to actually stage the new clipboard contents before
    // we fire the keystroke.
    thread::sleep(Duration::from_millis(PASTE_STAGE_DELAY_MS));
    // re focus right before the synth so the staging sleep cannot cause the
    // ctrl plus v to land in the wrong window.
    if target_hwnd != 0 {
        if let Err(e) = focus_target_blocking(target_hwnd) {
            tracing::warn!(?e, "paste_chunk: focus_target failed pre synth");
        }
    }
    synth_ctrl_v().context("synth Ctrl+V")?;
    tracing::debug!("paste: ctrl+v dispatched");
    // wait for the target app to read the clipboard. shorter than the one
    // shot path because the next chunk (or the restore) is right behind us.
    thread::sleep(Duration::from_millis(PASTE_DWELL_MS));
    Ok(())
}

fn restore_clipboard_blocking(prior: Option<String>) -> Result<()> {
    match prior {
        Some(prev) => {
            let mut cb = open_clipboard_with_retry().context("open clipboard")?;
            // use the retry helper and propagate failures so the caller's
            // error log can actually fire on transient contention.
            set_clipboard_text_with_retry(&mut cb, prev).context("restore clipboard text")?;
        }
        None => {
            // we only snapshot text, so None means the clipboard held non text
            // content (image, files). leave it untouched rather than clearing
            // and destroying what the user had.
        }
    }
    Ok(())
}

fn paste_text_blocking(text: &str) -> Result<()> {
    let prior = snapshot_clipboard_blocking();
    let target_hwnd = crate::target_app::current_foreground_hwnd();
    paste_chunk_blocking(text, false, target_hwnd)?;
    // a touch more dwell time before restoring so slow apps finish reading.
    thread::sleep(Duration::from_millis(PASTE_RESTORE_GUARD_MS));
    restore_clipboard_blocking(prior)?;
    Ok(())
}

fn copy_only_blocking(text: &str) -> Result<()> {
    let mut cb = open_clipboard_with_retry().context("open clipboard")?;
    set_clipboard_text_with_retry(&mut cb, text.to_string())
        .context("write transcript to clipboard")?;
    drop(cb);
    mark_clipboard_private();
    Ok(())
}

/// re focus the captured target window before we synth the paste. when the
/// indicator pops up the foreground can drift to us, even with
/// `WS_EX_NOACTIVATE`, so we explicitly attach to the target's input queue
/// and call `SetForegroundWindow`.
///
/// passing `hwnd_isize == 0` is a no op so the non windows stub stays cheap.
#[cfg(windows)]
fn focus_target_blocking(hwnd_isize: isize) -> Result<()> {
    if hwnd_isize == 0 {
        return Ok(());
    }
    let target = HWND(hwnd_isize as *mut core::ffi::c_void);
    unsafe {
        // best effort: grant foreground rights to all processes. this only
        // takes effect while we still hold the foreground ourselves, so once
        // focus has drifted away it is a no op. the AttachThreadInput path
        // below is what actually makes SetForegroundWindow succeed.
        let _ = AllowSetForegroundWindow(ASFW_ANY);

        let target_tid = GetWindowThreadProcessId(target, None);
        if target_tid == 0 {
            return Err(anyhow::anyhow!("target window thread id"));
        }
        let this_tid = GetCurrentThreadId();

        let attached = AttachThreadInput(this_tid, target_tid, true).as_bool();

        let mut ok = false;
        for _ in 0..FOCUS_RETRIES {
            if SetForegroundWindow(target).as_bool() {
                ok = true;
                break;
            }
            thread::sleep(Duration::from_millis(RETRY_BACKOFF_MS));
        }

        if attached {
            let _ = AttachThreadInput(this_tid, target_tid, false);
        }

        if !ok {
            return Err(anyhow::anyhow!("SetForegroundWindow refused"));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn focus_target_blocking(hwnd_isize: isize) -> Result<()> {
    let _ = hwnd_isize;
    Ok(())
}

#[cfg(windows)]
fn synth_ctrl_v() -> Result<()> {
    // raii guard so the ctrl key release fires even if we panic between
    // press and release. on every path we set `released` to true after the
    // explicit release, so the drop is a no op in the happy case.
    struct CtrlGuard {
        released: bool,
    }
    impl Drop for CtrlGuard {
        fn drop(&mut self) {
            if !self.released {
                let _ = send_scancode(SCANCODE_CONTROL, true);
            }
        }
    }

    send_scancode(SCANCODE_CONTROL, false).context("press ctrl")?;
    let mut guard = CtrlGuard { released: false };
    send_scancode(SCANCODE_V, false).context("press v")?;
    send_scancode(SCANCODE_V, true).context("release v")?;
    send_scancode(SCANCODE_CONTROL, true).context("release ctrl")?;
    guard.released = true;
    Ok(())
}

#[cfg(not(windows))]
fn synth_ctrl_v() -> Result<()> {
    Err(anyhow::anyhow!("paste not supported on this platform"))
}

#[cfg(windows)]
fn send_scancode(scancode: u16, key_up: bool) -> Result<()> {
    let flags: KEYBD_EVENT_FLAGS = if key_up {
        KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP
    } else {
        KEYEVENTF_SCANCODE
    };
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scancode,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0usize,
            },
        },
    };
    let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
    if sent != 1 {
        return Err(anyhow::anyhow!(
            "SendInput sent {} events, expected 1",
            sent
        ));
    }
    Ok(())
}
