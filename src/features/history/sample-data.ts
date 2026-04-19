import type { Transcript } from "@/lib/tauri";

const now = Date.now();
const m = (mins: number) => new Date(now - mins * 60_000).toISOString();

/**
 * In-browser dev fallback. Only rendered when running outside the Tauri
 * runtime (e.g., `pnpm dev` on a developer's machine before they've wired
 * up the backend).
 */
export const SAMPLE_TRANSCRIPTS: Transcript[] = [
  {
    id: "t1",
    createdAt: m(2),
    durationSec: 12,
    text: "Let's ship the new dictation flow before end of week. I think we can get the hotkey latency under 80 milliseconds if we drop rdev and write the hook directly in windows-rs.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t2",
    createdAt: m(18),
    durationSec: 5,
    text: "Remind me to check the Parakeet model size before we add it to the bundle — I think we'll need a first-run download instead of shipping it in the installer.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t3",
    createdAt: m(60),
    durationSec: 27,
    text: "The ring buffer approach from Hex is actually genius. They keep one second of audio warm at all times, and on hotkey press they prepend roughly four hundred and fifty milliseconds of it to the file. That's why it catches the first syllable.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t4",
    createdAt: m(180),
    durationSec: 8,
    text: "Okay testing this on VS Code now. Pressing right control, speaking, releasing. Looks clean.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t5",
    createdAt: m(60 * 24),
    durationSec: 42,
    text: "Long-form test. We want to verify that sherpa-onnx handles three minute clips without running out of memory or chopping off the end. Starting from here: the quick brown fox jumps over the lazy dog, and the pangram continues forever and ever and ever.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
];

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
