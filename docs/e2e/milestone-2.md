# Milestone 2 — Full Dictation Pipeline

Run this on **Windows 10/11**. The backend cannot execute on Linux (WASAPI,
`SetWindowsHookEx`, `SendInput`, WebView2 are all Windows-only surfaces).

## Prep

```powershell
pnpm install
pnpm tauri dev
```

First launch will download Parakeet-TDT v3 int8 (~600 MB combined). Wait for
the header to stop showing "downloading …".

## Checklist

### Tray + windows

- [ ] Tray icon appears in the system tray area.
- [ ] Main window opens with History view selected.
- [ ] Left-clicking the tray icon toggles the main window.
- [ ] Right-click tray shows: `Open Mumble` / `Pause dictation` / `Quit Mumble`.
- [ ] Closing the main window (X button) hides it to tray — does NOT quit.
- [ ] Quitting via tray actually exits the process.

### Hotkey + pipeline

- [ ] Focus **Notepad**. Press & hold `Right Ctrl`.
- [ ] Floating mic indicator appears bottom-center within ~100 ms.
- [ ] Waveform animates to your voice (32 bars, meter driven).
- [ ] Timer counts seconds.
- [ ] Release `Right Ctrl`. Indicator shows `Transcribing…` briefly.
- [ ] Transcript pastes at cursor within ~1.5 s for a short phrase.
- [ ] Indicator disappears cleanly.
- [ ] History view (in main window) now shows the utterance at top.

### Clipboard safety

- [ ] Before test: `Ctrl+C` some text (e.g. "hello world").
- [ ] Dictate something.
- [ ] After dictation completes, `Ctrl+V` in another app — original "hello
      world" pastes, not the transcript.

### Pre-roll

- [ ] Start speaking *while* pressing the hotkey (don't wait for the
      indicator). First syllable should still appear in the transcript.

### Sub-threshold guard

- [ ] Press + release the hotkey in <300 ms without speaking.
- [ ] No empty transcript should be inserted; no indicator flicker.

### Settings

- [ ] Change hotkey: `Settings → Change` → press `F13` (or any unused key).
      Confirm the hotkey works with the new binding.
- [ ] Toggle `Launch at login`. Reboot. App is in tray at login.
- [ ] Toggle `Start minimized to tray`. Restart app. Main window is hidden.
- [ ] Change `Input device` to a non-default mic. Dictate. Confirm the correct
      mic is captured (talk into the non-default one, silence into the other).
- [ ] `Re-download model` deletes + re-fetches assets and ends with a toast.

### History

- [ ] Dictate 3 different phrases.
- [ ] Search for a word in the search box → list filters live.
- [ ] Click a row. Detail panel shows full text.
- [ ] `Copy` button copies to clipboard.
- [ ] `Paste again` pastes the old transcript at the cursor of whatever app
      you next focus within ~150 ms.
- [ ] `Delete` removes the row; detail panel jumps to the next transcript.
- [ ] `Clear all` prompts a confirm dialog → on confirm, list empties.

### Long-form

- [ ] Hold hotkey for 2+ minutes, narrate. Release.
- [ ] Transcript is coherent with punctuation, no truncation.

### Pause

- [ ] Right-click tray → `Pause dictation`. Hotkey becomes a no-op.
- [ ] Right-click → `Resume dictation`. Hotkey works again.

### Performance

- [ ] Idle RAM < 150 MB.
- [ ] Cold start (no model download) to tray < 1.5 s.
- [ ] `tauri build --release` produces an `.msi` or `.exe` < 20 MB (ex-model).

## Screenshots to capture (`docs/screenshots/m2/`)

- `01-tray-menu.png` — right-click tray context menu.
- `02-recording.png` — mic indicator while recording (waveform visible).
- `03-transcribing.png` — indicator in transcribing state.
- `04-history-populated.png` — History view with real dictations.
- `05-history-detail.png` — Detail panel open.
- `06-settings-hotkey-capture.png` — Settings during hotkey rebind.
- `07-settings-light.png` / `08-settings-dark.png` — both themes.
- `09-download-progress.png` — first-run model download.
