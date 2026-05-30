# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public GitHub issue.

- Email: `security@<TBD>` (TODO: replace with a real disclosure address before publishing the repo)
- Include: affected version or commit, reproduction steps, impact assessment, and any proof-of-concept.

We will acknowledge your report within **7 days** and aim to ship a fix or publish a coordinated disclosure within **30 days** of acknowledgement. If we need more time we will say so in writing.

## Threat model

Mumble runs locally on a Windows machine and is designed around three sensitive surfaces.

- **Audio capture.** Microphone input is captured via WASAPI (`cpal`) and held in a short in-memory ring buffer while the push-to-talk hotkey is held. Audio is not written to disk and is not transmitted off the machine.
- **Keystroke injection.** After transcription, Mumble synthesizes `Ctrl+V` against the previously-focused window in order to paste the transcript. The user's existing input focus and clipboard scope therefore define the blast radius of a malicious or accidental transcript.
- **Network egress.** The only outbound network call Mumble performs is the first-run model download from `huggingface.co` (and its CDN). After the model is cached locally, the app operates fully offline. Telemetry, crash reporting, and remote configuration are all absent by design.

A global low-level keyboard hook is installed via the [`rdev`](https://crates.io/crates/rdev) crate so the push-to-talk key can be detected even when Mumble is not focused. **No keystrokes are stored, logged, or transmitted.** The hook only inspects key codes to decide whether the bound hotkey is pressed or released; all other key events pass through untouched.

During paste the clipboard is briefly overwritten with the transcript, `Ctrl+V` is synthesized, and the prior clipboard contents are restored. There is a ~120 ms window during which the transcript is observable to any clipboard-history tool running on the machine.

## Out of scope

- Physical access attacks against the machine running Mumble.
- Vulnerabilities in third-party transitive dependencies for which an upstream fix already exists. We will still take patches that pin or bump those deps.
- Issues that require the attacker to already have arbitrary code execution as the user running Mumble.

## See also

- `NOTES.md` — running log of decisions, bug fixes, and learnings that may help when reasoning about the codebase.
- `NOTICE` — third-party attributions and licenses.
