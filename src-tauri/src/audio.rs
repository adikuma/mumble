//! Audio capture + pre-roll ring buffer.
//!
//! Uses cpal in default config (WASAPI shared-mode on Windows).
//! Continuously runs the input stream while the app is alive, pushing samples
//! into a ring buffer. When recording starts, we begin appending to an in-memory
//! Vec _plus_ we prepend the last ~0.45 s already in the ring buffer — this is
//! Hex's trick for never clipping the first syllable.
//!
//! On stop, we mono-downmix + resample to 16 kHz and return a Vec<f32>.

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Stream, StreamConfig};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

const TARGET_SAMPLE_RATE: u32 = 16_000;
const PREROLL_SECONDS: f32 = 0.45;
const RING_SECONDS: f32 = 1.0;

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

/// Runs for the life of the app. The inner stream is held alive via `_stream`
/// because cpal stops capture when the Stream is dropped.
pub struct CaptureEngine {
    _stream: Stream,
    ring: Arc<Mutex<RingBuffer>>,
    recording_buf: Arc<Mutex<Vec<f32>>>,
    recording: Arc<AtomicBool>,
    source_rate: u32,
    source_channels: u16,
    meter: Arc<AtomicU64>, // f32 bits of current RMS
}

// Safety: cpal::Stream is not Send on all platforms in older versions; we only
// use it from the thread that constructed it. Tauri's state is `Send + Sync`
// so we wrap the whole engine in `Mutex` from the caller side.
unsafe impl Send for CaptureEngine {}
unsafe impl Sync for CaptureEngine {}

struct RingBuffer {
    buf: Vec<f32>,
    write: usize,
    filled: usize,
}

impl RingBuffer {
    fn new(cap: usize) -> Self {
        Self {
            buf: vec![0.0; cap],
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

impl CaptureEngine {
    pub fn start(device_name: Option<&str>) -> Result<Self> {
        let host = cpal::default_host();
        let device = pick_device(&host, device_name)?;
        let config = device.default_input_config().context("default config")?;

        let source_rate = config.sample_rate().0;
        let source_channels = config.channels();

        let ring_cap = (source_rate as f32 * RING_SECONDS * source_channels as f32) as usize;
        let ring = Arc::new(Mutex::new(RingBuffer::new(ring_cap)));
        let recording_buf = Arc::new(Mutex::new(Vec::new()));
        let recording = Arc::new(AtomicBool::new(false));
        let meter = Arc::new(AtomicU64::new(0));

        let stream_config: StreamConfig = config.clone().into();
        let sample_format = config.sample_format();

        let cb_ring = Arc::clone(&ring);
        let cb_rec_buf = Arc::clone(&recording_buf);
        let cb_recording = Arc::clone(&recording);
        let cb_meter = Arc::clone(&meter);

        let stream = match sample_format {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    process_samples(data, &cb_ring, &cb_rec_buf, &cb_recording, &cb_meter);
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    let converted: Vec<f32> =
                        data.iter().map(|s| *s as f32 / i16::MAX as f32).collect();
                    process_samples(&converted, &cb_ring, &cb_rec_buf, &cb_recording, &cb_meter);
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
                    process_samples(&converted, &cb_ring, &cb_rec_buf, &cb_recording, &cb_meter);
                },
                err_fn,
                None,
            )?,
            fmt => return Err(anyhow!("unsupported sample format: {:?}", fmt)),
        };

        stream.play()?;

        Ok(Self {
            _stream: stream,
            ring,
            recording_buf,
            recording,
            source_rate,
            source_channels,
            meter,
        })
    }

    pub fn start_recording(&self) {
        let preroll_samples =
            (self.source_rate as f32 * PREROLL_SECONDS * self.source_channels as f32) as usize;
        let tail = self.ring.lock().tail(preroll_samples);
        {
            let mut buf = self.recording_buf.lock();
            buf.clear();
            buf.extend_from_slice(&tail);
        }
        self.recording.store(true, Ordering::Release);
    }

    /// Stop recording. Returns (samples_16k_mono, duration_sec).
    pub fn stop_recording(&self) -> (Vec<f32>, f64) {
        self.recording.store(false, Ordering::Release);
        let raw = {
            let mut buf = self.recording_buf.lock();
            std::mem::take(&mut *buf)
        };
        let mono = downmix_mono(&raw, self.source_channels);
        let resampled = resample_linear(&mono, self.source_rate, TARGET_SAMPLE_RATE);
        let duration = resampled.len() as f64 / TARGET_SAMPLE_RATE as f64;
        (resampled, duration)
    }

    pub fn current_rms(&self) -> f32 {
        f32::from_bits(self.meter.load(Ordering::Acquire) as u32)
    }
}

fn process_samples(
    data: &[f32],
    ring: &Arc<Mutex<RingBuffer>>,
    rec_buf: &Arc<Mutex<Vec<f32>>>,
    recording: &Arc<AtomicBool>,
    meter: &Arc<AtomicU64>,
) {
    ring.lock().push(data);
    if recording.load(Ordering::Acquire) {
        rec_buf.lock().extend_from_slice(data);
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

/// Write 16 kHz mono f32 samples as a 16-bit PCM WAV file.
#[allow(dead_code)]
pub fn write_wav(path: &std::path::Path, samples: &[f32]) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)?;
    for s in samples {
        let clamped = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(clamped)?;
    }
    writer.finalize()?;
    Ok(())
}
