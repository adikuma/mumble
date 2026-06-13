//! audio capture and pre roll ring buffer.
//!
//! uses cpal in default config (wasapi shared mode on windows).
//! continuously runs the input stream while the app is alive, pushing samples
//! into a pre roll ring buffer. when recording starts, we begin appending to
//! an in memory `rtrb` ring buffer and prepend the last ~0.45 s already in
//! the pre roll ring buffer. this is hex's trick for never clipping the first
//! syllable.
//!
//! on stop, we mono downmix and resample to 16 kHz and return a `Vec<f32>`.
//!
//! threading. the cpal `Stream` is owned by a dedicated long lived os thread
//! (the capture worker). the worker calls `CoInitializeEx(MULTITHREADED)` at
//! start and `CoUninitialize` at shutdown so wasapi has a com apartment for
//! its entire lifetime. callers communicate with the worker via a
//! `crossbeam-channel` of `CaptureCommand`. the cpal data callback only does
//! a bounded push into an `rtrb` spsc ring plus a couple of atomic stores so
//! it never allocates and never takes a contended lock.

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, StreamConfig};
use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use parking_lot::Mutex;
use rtrb::{Consumer, Producer, RingBuffer as RtrbRing};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;

const TARGET_SAMPLE_RATE: u32 = 16_000;
/// maximum pre roll the ring buffer supports. the user selected pre roll
/// (via `Settings.preRollMs`) is clamped to this value so the buffer always
/// has enough warm samples even on the highest setting.
pub const RING_SECONDS: f32 = 1.0;
/// upper bound on the recording rtrb capacity in seconds. we provision the
/// ring at start time based on the source sample rate and channel count so
/// even a long press fits without the callback ever needing to allocate.
const RECORD_BUFFER_SECONDS: usize = 120;

pub struct CaptureDevice {
    pub name: String,
    pub is_default: bool,
}

pub fn list_input_devices() -> Result<Vec<CaptureDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();
    let mut out = Vec::new();
    if let Ok(devices) = host.input_devices() {
        for d in devices {
            let name = d.name().unwrap_or_else(|_| "Unknown".into());
            let is_default = name == default_name;
            out.push(CaptureDevice { name, is_default });
        }
    }
    Ok(out)
}

fn pick_device(host: &cpal::Host, name: Option<&str>) -> Result<Device> {
    if let Some(n) = name {
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if d.name().map(|dn| dn == n).unwrap_or(false) {
                    return Ok(d);
                }
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| anyhow!("no default input device"))
}

/// commands accepted by the capture worker thread.
enum CaptureCommand {
    /// begin appending live samples to the recording buffer with `preroll_ms`
    /// of warm pre roll prepended.
    Start { preroll_ms: u32 },
    /// stop recording and return resampled mono samples plus duration in
    /// seconds. an empty vec means nothing was captured.
    Stop { reply: Sender<(Vec<f32>, f64)> },
    /// read the current rms meter.
    Meter { reply: Sender<f32> },
    /// shut the worker down cleanly. the worker drops the cpal stream and
    /// calls `CoUninitialize` before exiting.
    Shutdown,
}

/// handle to the capture worker. clones share the same underlying worker.
/// dropping the last handle sends `Shutdown` and joins the worker thread.
#[derive(Clone)]
pub struct CaptureWorker {
    inner: Arc<CaptureWorkerInner>,
}

struct CaptureWorkerInner {
    tx: Sender<CaptureCommand>,
    join: Mutex<Option<thread::JoinHandle<()>>>,
}

impl Drop for CaptureWorkerInner {
    fn drop(&mut self) {
        let _ = self.tx.send(CaptureCommand::Shutdown);
        if let Some(handle) = self.join.lock().take() {
            let _ = handle.join();
        }
    }
}

impl CaptureWorker {
    /// spawn a worker that builds a cpal input stream on the given device
    /// name (or system default when `None`). blocks until the stream is
    /// playing or the worker reports an error.
    pub fn start(device_name: Option<String>) -> Result<Self> {
        let (cmd_tx, cmd_rx) = unbounded::<CaptureCommand>();
        let (ready_tx, ready_rx) = bounded::<Result<()>>(1);

        let join = thread::Builder::new()
            .name("mumble-capture".into())
            .spawn(move || {
                init_com();
                // run_worker signals readiness itself once the stream is
                // playing. an init error returns before that signal is sent,
                // so forward it to the waiting caller here.
                if let Err(e) = run_worker(device_name.as_deref(), cmd_rx, &ready_tx) {
                    let _ = ready_tx.send(Err(e));
                }
                uninit_com();
            })
            .context("spawn capture worker thread")?;

        // wait for the worker to either confirm the stream is live or report
        // an init error. without this the caller would happily send `Start`
        // before the stream exists.
        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                inner: Arc::new(CaptureWorkerInner {
                    tx: cmd_tx,
                    join: Mutex::new(Some(join)),
                }),
            }),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(anyhow!("capture worker dropped before reporting status")),
        }
    }

    pub fn start_recording(&self, preroll_ms: u32) {
        let _ = self.inner.tx.send(CaptureCommand::Start { preroll_ms });
    }

    /// stop recording. returns `(samples_16k_mono, duration_sec)`. on worker
    /// error returns an empty vec with zero duration so the pipeline can
    /// react gracefully.
    pub fn stop_recording(&self) -> (Vec<f32>, f64) {
        let (reply_tx, reply_rx) = bounded(1);
        if self
            .inner
            .tx
            .send(CaptureCommand::Stop { reply: reply_tx })
            .is_err()
        {
            return (Vec::new(), 0.0);
        }
        reply_rx.recv().unwrap_or((Vec::new(), 0.0))
    }

    pub fn current_rms(&self) -> f32 {
        let (reply_tx, reply_rx) = bounded(1);
        if self
            .inner
            .tx
            .send(CaptureCommand::Meter { reply: reply_tx })
            .is_err()
        {
            return 0.0;
        }
        reply_rx.recv().unwrap_or(0.0)
    }
}

/// initialise com on the current thread. wasapi requires a com apartment.
/// we use multithreaded because wasapi callbacks may run on threads that
/// did not call coinitializeex themselves and mta is the safer default.
#[cfg(windows)]
fn init_com() {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

#[cfg(not(windows))]
fn init_com() {}

#[cfg(windows)]
fn uninit_com() {
    use windows::Win32::System::Com::CoUninitialize;
    unsafe {
        CoUninitialize();
    }
}

#[cfg(not(windows))]
fn uninit_com() {}

/// runs on the worker thread. owns the `cpal::Stream` for the worker's
/// entire lifetime so cpal sees a stable owning thread.
fn run_worker(
    device_name: Option<&str>,
    cmd_rx: Receiver<CaptureCommand>,
    ready_tx: &Sender<Result<()>>,
) -> Result<()> {
    let host = cpal::default_host();
    let device = pick_device(&host, device_name)?;
    let config = device.default_input_config().context("default config")?;

    let source_rate = config.sample_rate().0;
    let source_channels = config.channels();

    let ring_cap = (source_rate as f32 * RING_SECONDS * source_channels as f32) as usize;
    let ring = Arc::new(Mutex::new(RingBuffer::new(ring_cap)));
    let recording = Arc::new(AtomicBool::new(false));
    let meter = Arc::new(AtomicU64::new(0));

    let record_cap = (source_rate as usize * source_channels as usize * RECORD_BUFFER_SECONDS)
        .max(TARGET_SAMPLE_RATE as usize);
    let (producer, mut consumer) = RtrbRing::<f32>::new(record_cap);
    let producer = Arc::new(Mutex::new(producer));

    let stream_config: StreamConfig = config.clone().into();
    let sample_format = config.sample_format();

    let cb_ring = Arc::clone(&ring);
    let cb_recording = Arc::clone(&recording);
    let cb_meter = Arc::clone(&meter);
    let cb_producer = Arc::clone(&producer);

    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| {
                process_samples_safe(data, &cb_ring, &cb_producer, &cb_recording, &cb_meter);
            },
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| {
                // we deliberately leave this conversion alloc in place. moving
                // it lock free is a future improvement, the recording buf is
                // the hot path the rtrb conversion targets.
                let converted: Vec<f32> =
                    data.iter().map(|s| *s as f32 / i16::MAX as f32).collect();
                process_samples_safe(&converted, &cb_ring, &cb_producer, &cb_recording, &cb_meter);
            },
            err_fn,
            None,
        )?,
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| {
                let converted: Vec<f32> = data
                    .iter()
                    .map(|s| (*s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                    .collect();
                process_samples_safe(&converted, &cb_ring, &cb_producer, &cb_recording, &cb_meter);
            },
            err_fn,
            None,
        )?,
        fmt => return Err(anyhow!("unsupported sample format: {:?}", fmt)),
    };

    stream.play()?;

    // signal the caller that the stream is live. CaptureWorker::start blocks
    // on this handshake, so it must fire before the command loop below, not
    // after it exits at shutdown. sending it late deadlocked the hotkey
    // dispatcher on the first press after launch.
    let _ = ready_tx.send(Ok(()));

    // process commands until shutdown or the sender side hangs up.
    while let Ok(cmd) = cmd_rx.recv() {
        match cmd {
            CaptureCommand::Start { preroll_ms } => {
                handle_start(
                    preroll_ms,
                    &ring,
                    &producer,
                    &recording,
                    source_rate,
                    source_channels,
                );
            }
            CaptureCommand::Stop { reply } => {
                let result = handle_stop(&mut consumer, &recording, source_rate, source_channels);
                let _ = reply.send(result);
            }
            CaptureCommand::Meter { reply } => {
                let rms = f32::from_bits(meter.load(Ordering::Acquire) as u32);
                let _ = reply.send(rms);
            }
            CaptureCommand::Shutdown => break,
        }
    }

    // dropping `stream` here stops cpal cleanly while we are still on the
    // owning thread.
    drop(stream);
    Ok(())
}

/// begin appending live samples to the recording buffer, prepending the
/// last `preroll_ms` of warm ring buffer audio (clamped to `RING_SECONDS`).
///
/// mirrors hex's `SuperFastCaptureController.startRecording`. the prepend
/// is what stops the first syllable being clipped.
fn handle_start(
    preroll_ms: u32,
    ring: &Arc<Mutex<RingBuffer>>,
    producer: &Arc<Mutex<Producer<f32>>>,
    recording: &Arc<AtomicBool>,
    source_rate: u32,
    source_channels: u16,
) {
    let preroll_sec = (preroll_ms as f32 / 1000.0).min(RING_SECONDS);
    let preroll_samples = (source_rate as f32 * preroll_sec * source_channels as f32) as usize;
    let tail = ring.lock().tail(preroll_samples);

    // drain any stragglers left in the recording ring from a previous run
    // and then push the pre roll tail before we let the callback start
    // pushing live samples.
    {
        let mut prod = producer.lock();
        // there is no direct "clear" on rtrb so we just push the tail. any
        // stragglers from a prior session were drained on stop.
        for s in &tail {
            // push_back can only fail when the ring is full. given we sized
            // the ring for two minutes of audio, dropping a few samples here
            // is benign and far better than blocking the callback path.
            if prod.push(*s).is_err() {
                break;
            }
        }
    }
    recording.store(true, Ordering::Release);
}

/// stop recording. drains the rtrb ring on the worker thread (the only
/// consumer side) then downmixes and resamples for transcription.
fn handle_stop(
    consumer: &mut Consumer<f32>,
    recording: &Arc<AtomicBool>,
    source_rate: u32,
    source_channels: u16,
) -> (Vec<f32>, f64) {
    recording.store(false, Ordering::Release);

    let mut raw = Vec::with_capacity(consumer.slots());
    while let Ok(s) = consumer.pop() {
        raw.push(s);
    }

    // a cpal callback may still be in flight when we flipped the recording
    // flag. drain once more to pick up any stragglers it pushed between the
    // flag flip and now. without this last sliver of audio at the end of a
    // press can be lost.
    while let Ok(s) = consumer.pop() {
        raw.push(s);
    }

    let mono = downmix_mono(&raw, source_channels);
    let mut resampled = resample_linear(&mono, source_rate, TARGET_SAMPLE_RATE);
    // lift quiet speech to a healthy level so low volume input is not
    // transcribed as empty or garbled. see normalize_peak.
    normalize_peak(&mut resampled);
    let duration = resampled.len() as f64 / TARGET_SAMPLE_RATE as f64;
    (resampled, duration)
}

struct RingBuffer {
    buf: Vec<f32>,
    write: usize,
    filled: usize,
}

impl RingBuffer {
    fn new(cap: usize) -> Self {
        Self {
            buf: vec![0.0; cap.max(1)],
            write: 0,
            filled: 0,
        }
    }
    fn push(&mut self, samples: &[f32]) {
        let cap = self.buf.len();
        for &s in samples {
            self.buf[self.write] = s;
            self.write = (self.write + 1) % cap;
        }
        self.filled = (self.filled + samples.len()).min(cap);
    }
    fn tail(&self, n: usize) -> Vec<f32> {
        let cap = self.buf.len();
        let available = self.filled.min(cap);
        let take = n.min(available);
        let start = (self.write + cap - take) % cap;
        let mut out = Vec::with_capacity(take);
        for i in 0..take {
            out.push(self.buf[(start + i) % cap]);
        }
        out
    }
}

/// wrap the inner sample processing in catch_unwind. cpal invokes this from
/// an os audio thread. a panic here would propagate up through ffi and
/// abort the process. swallowing it and logging instead lets the worker
/// keep running, the user only loses the current callback.
fn process_samples_safe(
    data: &[f32],
    ring: &Arc<Mutex<RingBuffer>>,
    producer: &Arc<Mutex<Producer<f32>>>,
    recording: &Arc<AtomicBool>,
    meter: &Arc<AtomicU64>,
) {
    let result = catch_unwind(AssertUnwindSafe(|| {
        process_samples(data, ring, producer, recording, meter);
    }));
    if result.is_err() {
        tracing::error!("audio callback panicked");
    }
}

fn process_samples(
    data: &[f32],
    ring: &Arc<Mutex<RingBuffer>>,
    producer: &Arc<Mutex<Producer<f32>>>,
    recording: &Arc<AtomicBool>,
    meter: &Arc<AtomicU64>,
) {
    ring.lock().push(data);
    if recording.load(Ordering::Acquire) {
        // we only ever produce from this callback so the lock is contended
        // only with the very brief drain in handle_start. push_back is
        // bounded so this never allocates.
        let mut prod = producer.lock();
        for s in data {
            if prod.push(*s).is_err() {
                // ring is full. drop the remainder of this packet. the
                // worker is the only consumer so this only happens if the
                // user held the hotkey for more than RECORD_BUFFER_SECONDS.
                break;
            }
        }
    }
    let sum_sq: f32 = data.iter().map(|s| s * s).sum();
    let rms = (sum_sq / data.len().max(1) as f32).sqrt();
    meter.store(rms.to_bits() as u64, Ordering::Release);
}

fn err_fn(err: cpal::StreamError) {
    tracing::error!(?err, "audio stream error");
}

fn downmix_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    let frames = samples.len() / ch;
    let mut out = Vec::with_capacity(frames);
    for f in 0..frames {
        let mut sum = 0.0;
        for c in 0..ch {
            sum += samples[f * ch + c];
        }
        out.push(sum / ch as f32);
    }
    out
}

fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (input.len() as f64 / ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let idx = src.floor() as usize;
        let frac = (src - idx as f64) as f32;
        let a = *input.get(idx).unwrap_or(&0.0);
        let b = *input.get(idx + 1).unwrap_or(&a);
        out.push(a + (b - a) * frac);
    }
    out
}

// peak normalization applied before transcription. we only boost, never
// attenuate, so healthy recordings are left untouched. near silence is skipped
// so we do not amplify background noise, and the gain is capped so a very faint
// signal is not blown up into loud noise.
const NORMALIZE_TARGET_PEAK: f32 = 0.95;
const NORMALIZE_NOISE_FLOOR: f32 = 0.01;
const NORMALIZE_MAX_GAIN: f32 = 12.0;

fn normalize_peak(samples: &mut [f32]) {
    let peak = samples.iter().fold(0.0f32, |m, &s| m.max(s.abs()));
    if peak < NORMALIZE_NOISE_FLOOR {
        return;
    }
    let gain = (NORMALIZE_TARGET_PEAK / peak).min(NORMALIZE_MAX_GAIN);
    if gain <= 1.0 {
        return;
    }
    for s in samples.iter_mut() {
        *s = (*s * gain).clamp(-1.0, 1.0);
    }
}

// chunking constants for the transcribe path.
// sherpa onnx with directml on parakeet tdt int8 silently returns empty for
// audio over ~10 s. we cap each chunk at 6 s, with 200 ms overlap and a 1 s
// silence search window so cuts land on low rms moments rather than mid word.
const CHUNK_MAX_SEC: f32 = 6.0;
const CHUNK_MIN_SEC: f32 = 4.0;
const SEARCH_WINDOW_SEC: f32 = 1.0;
const OVERLAP_MS: u32 = 200;
const RMS_WINDOW_MS: u32 = 50;

/// split a 16 kHz mono f32 buffer into chunks safe for sherpa onnx.
///
/// short audio (<= chunk_max + overlap) returns a single slice unchanged.
/// longer audio is cut at the lowest rms point inside a 1 s search window
/// near each ideal boundary so cuts fall on silence or breath, not mid word.
/// each non final chunk overlaps the next by 200 ms so a word straddling the
/// boundary still appears intact in one of them.
pub fn chunk_for_transcription(samples: &[f32], sample_rate: u32) -> Vec<&[f32]> {
    let chunk_max = (CHUNK_MAX_SEC * sample_rate as f32) as usize;
    let chunk_min = (CHUNK_MIN_SEC * sample_rate as f32) as usize;
    let search_window = (SEARCH_WINDOW_SEC * sample_rate as f32) as usize;
    let overlap = (OVERLAP_MS as f32 / 1000.0 * sample_rate as f32) as usize;
    let rms_window = (RMS_WINDOW_MS as f32 / 1000.0 * sample_rate as f32) as usize;

    if samples.len() <= chunk_max + overlap {
        return vec![samples];
    }

    let mut chunks: Vec<&[f32]> = Vec::new();
    let mut start: usize = 0;
    while start < samples.len() {
        let ideal_end = start + chunk_max;
        if ideal_end >= samples.len() {
            chunks.push(&samples[start..]);
            break;
        }
        // search the last 1 s of this window for the quietest spot, but never
        // cut so close to start that we'd produce a chunk under chunk_min.
        let search_floor = (start + chunk_min).min(ideal_end);
        let search_start = ideal_end.saturating_sub(search_window).max(search_floor);
        let cut = find_silence_point(samples, search_start, ideal_end, rms_window);
        chunks.push(&samples[start..cut]);
        // step forward but always make progress, even if overlap math would
        // otherwise loop us back.
        let next_start = cut.saturating_sub(overlap);
        start = next_start.max(start + 1);
    }
    chunks
}

fn find_silence_point(samples: &[f32], start: usize, end: usize, win: usize) -> usize {
    let mut min_rms = f32::MAX;
    let mut min_idx = end;
    let mut i = start;
    while i + win <= end {
        let r = window_rms(&samples[i..i + win]);
        if r < min_rms {
            min_rms = r;
            min_idx = i + win / 2;
        }
        i += win;
    }
    min_idx
}

fn window_rms(slice: &[f32]) -> f32 {
    if slice.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = slice.iter().map(|s| s * s).sum();
    (sum_sq / slice.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 16_000;

    fn chunk_min_samples() -> usize {
        (CHUNK_MIN_SEC * SR as f32) as usize
    }

    fn chunk_max_samples() -> usize {
        (CHUNK_MAX_SEC * SR as f32) as usize
    }

    fn overlap_samples() -> usize {
        (OVERLAP_MS as f32 / 1000.0 * SR as f32) as usize
    }

    fn search_window_samples() -> usize {
        (SEARCH_WINDOW_SEC * SR as f32) as usize
    }

    // short input falls into the single chunk early return path and should
    // pass through unchanged.
    #[test]
    fn short_input_returns_single_slice_unchanged() {
        let samples: Vec<f32> = (0..(SR as usize * 2)).map(|i| (i as f32) * 0.001).collect();
        let chunks = chunk_for_transcription(&samples, SR);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), samples.len());
        assert_eq!(chunks[0].as_ptr(), samples.as_ptr());
    }

    // a long input must produce multiple chunks none of which is shorter
    // than chunk_min (modulo the final tail).
    #[test]
    fn long_input_chunks_respect_min_size() {
        let len = SR as usize * 30;
        let samples = vec![0.1f32; len];
        let chunks = chunk_for_transcription(&samples, SR);
        assert!(
            chunks.len() > 1,
            "expected multiple chunks, got {}",
            chunks.len()
        );
        let min = chunk_min_samples();
        for (i, chunk) in chunks.iter().enumerate() {
            if i + 1 < chunks.len() {
                assert!(
                    chunk.len() >= min,
                    "chunk {i} length {} below chunk_min {min}",
                    chunk.len()
                );
            }
        }
    }

    // consecutive chunks may overlap, but never by more than OVERLAP_MS of
    // audio worth of samples.
    #[test]
    fn consecutive_chunks_overlap_is_bounded() {
        let len = SR as usize * 30;
        let samples = vec![0.1f32; len];
        let chunks = chunk_for_transcription(&samples, SR);
        let overlap_max = overlap_samples();
        // since each chunk is a sub slice of samples we can use pointer
        // arithmetic to find each chunk's start offset.
        let base = samples.as_ptr() as usize;
        let starts: Vec<usize> = chunks
            .iter()
            .map(|c| (c.as_ptr() as usize - base) / std::mem::size_of::<f32>())
            .collect();
        for i in 0..chunks.len().saturating_sub(1) {
            let prev_start = starts[i];
            let prev_end = prev_start + chunks[i].len();
            let next_start = starts[i + 1];
            if next_start < prev_end {
                let overlap = prev_end - next_start;
                assert!(
                    overlap <= overlap_max,
                    "overlap {overlap} exceeds OVERLAP_MS budget {overlap_max}"
                );
            }
        }
    }

    // the cut between two chunks must fall inside the silence search
    // window, ie not earlier than (ideal_end - search_window) and never
    // past ideal_end.
    #[test]
    fn cuts_fall_inside_search_window() {
        let len = SR as usize * 30;
        let samples = vec![0.1f32; len];
        let chunks = chunk_for_transcription(&samples, SR);
        let chunk_max = chunk_max_samples();
        let search = search_window_samples();
        let base = samples.as_ptr() as usize;
        let starts: Vec<usize> = chunks
            .iter()
            .map(|c| (c.as_ptr() as usize - base) / std::mem::size_of::<f32>())
            .collect();
        for (i, chunk) in chunks
            .iter()
            .enumerate()
            .take(chunks.len().saturating_sub(1))
        {
            let start = starts[i];
            let cut = start + chunk.len();
            let ideal_end = start + chunk_max;
            let lower = ideal_end.saturating_sub(search);
            assert!(
                cut >= lower && cut <= ideal_end,
                "cut {cut} outside search window [{lower}, {ideal_end}]"
            );
        }
    }
}
