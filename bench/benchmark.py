"""benchmark a sherpa-onnx parakeet model against a subset of librispeech.

runs ONE model variant per invocation so each model's memory footprint is
measured in a clean process. decodes a subset of librispeech test-clean,
normalizes both reference and hypothesis with the whisper english normalizer
(the same one the open asr leaderboard uses, so our numbers compare to the
published ones), and scores wer and cer with jiwer. also records real time
factor and peak process memory.

usage:
  python benchmark.py --model-dir models/int8 --variant int8 --limit 150
"""

import argparse
import glob
import io
import json
import os
import threading
import time
from pathlib import Path

import numpy as np
import psutil
import sherpa_onnx
import soundfile as sf
from datasets import Audio, load_dataset
from jiwer import cer, wer
from whisper_normalizer.english import EnglishTextNormalizer


def find_model_files(model_dir):
    # works for both the int8 layout (encoder.int8.onnx) and the fp32 layout
    # (encoder.onnx) by globbing for each component.
    def pick(stem):
        matches = sorted(glob.glob(str(model_dir / f"{stem}*.onnx")))
        if not matches:
            raise FileNotFoundError(f"no {stem}*.onnx found in {model_dir}")
        return matches[0]

    return {
        "encoder": pick("encoder"),
        "decoder": pick("decoder"),
        "joiner": pick("joiner"),
        "tokens": str(model_dir / "tokens.txt"),
    }


def resample_linear(samples, orig_sr, target_sr):
    # dependency free linear resample, mirrors the rust resample in audio.rs.
    if orig_sr == target_sr or len(samples) == 0:
        return samples
    ratio = target_sr / orig_sr
    out_len = int(round(len(samples) * ratio))
    src_index = np.linspace(0, len(samples) - 1, out_len)
    return np.interp(src_index, np.arange(len(samples)), samples).astype(np.float32)


class PeakMemorySampler(threading.Thread):
    # samples process rss in the background so we capture the peak during decode.
    def __init__(self, interval=0.05):
        super().__init__(daemon=True)
        self.interval = interval
        self.proc = psutil.Process(os.getpid())
        self.peak = 0
        self.stop_flag = threading.Event()

    def run(self):
        while not self.stop_flag.is_set():
            rss = self.proc.memory_info().rss
            if rss > self.peak:
                self.peak = rss
            time.sleep(self.interval)

    def stop(self):
        self.stop_flag.set()
        self.join()


def build_recognizer(files, threads):
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=files["encoder"],
        decoder=files["decoder"],
        joiner=files["joiner"],
        tokens=files["tokens"],
        num_threads=threads,
        sample_rate=16000,
        feature_dim=80,
        decoding_method="greedy_search",
        model_type="nemo_transducer",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--limit", type=int, default=150)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--out-dir", default="out")
    parser.add_argument("--data-dir", default="data/librispeech/clean/test")
    args = parser.parse_args()

    proc = psutil.Process(os.getpid())
    baseline_rss = proc.memory_info().rss

    files = find_model_files(Path(args.model_dir))
    load_start = time.perf_counter()
    recognizer = build_recognizer(files, args.threads)
    load_sec = time.perf_counter() - load_start
    loaded_rss = proc.memory_info().rss

    normalizer = EnglishTextNormalizer()

    # load the librispeech test-clean parquet from disk (fetched by
    # download_models.py from the huggingface convert branch, so no dataset
    # loader script runs). audio decoding is disabled so we read the flac bytes
    # with soundfile and do not pull torch or torchcodec.
    dataset = load_dataset(
        "parquet",
        data_files=f"{args.data_dir}/*.parquet",
        split="train",
        streaming=True,
    )
    dataset = dataset.cast_column("audio", Audio(decode=False))

    sampler = PeakMemorySampler()
    sampler.start()

    refs, hyps = [], []
    audio_sec_total, proc_sec_total = 0.0, 0.0
    count = 0
    for example in dataset:
        if count >= args.limit:
            break
        audio = example["audio"]
        samples, sample_rate = sf.read(io.BytesIO(audio["bytes"]), dtype="float32")
        sample_rate = int(sample_rate)
        # downmix to mono if needed (librispeech is already mono 16k).
        if samples.ndim > 1:
            samples = samples.mean(axis=1).astype(np.float32)
        if sample_rate != 16000:
            samples = resample_linear(samples, sample_rate, 16000)
            sample_rate = 16000

        decode_start = time.perf_counter()
        stream = recognizer.create_stream()
        stream.accept_waveform(sample_rate, samples)
        recognizer.decode_streams([stream])
        proc_sec_total += time.perf_counter() - decode_start
        audio_sec_total += len(samples) / sample_rate

        hyps.append(normalizer(stream.result.text))
        refs.append(normalizer(example["text"]))
        count += 1

    sampler.stop()

    result = {
        "variant": args.variant,
        "model_dir": args.model_dir,
        "utterances": count,
        "wer_pct": round(wer(refs, hyps) * 100, 2),
        "cer_pct": round(cer(refs, hyps) * 100, 2),
        "audio_sec": round(audio_sec_total, 1),
        "proc_sec": round(proc_sec_total, 1),
        "rtf": round(proc_sec_total / audio_sec_total, 3) if audio_sec_total else None,
        "rtfx": round(audio_sec_total / proc_sec_total, 1) if proc_sec_total else None,
        "load_sec": round(load_sec, 2),
        "model_rss_mb": round((loaded_rss - baseline_rss) / 1e6, 1),
        "peak_rss_mb": round(sampler.peak / 1e6, 1),
        "threads": args.threads,
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.variant}.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
