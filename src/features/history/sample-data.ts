export interface Transcript {
  id: string;
  createdAt: string;
  durationSec: number;
  text: string;
}

export const SAMPLE_TRANSCRIPTS: Transcript[] = [
  {
    id: "t1",
    createdAt: "2 min ago",
    durationSec: 12,
    text: "Let's ship the new dictation flow before end of week. I think we can get the hotkey latency under 80 milliseconds if we drop rdev and write the hook directly in windows-rs.",
  },
  {
    id: "t2",
    createdAt: "18 min ago",
    durationSec: 5,
    text: "Remind me to check the Parakeet model size before we add it to the bundle — I think we'll need a first-run download instead of shipping it in the installer.",
  },
  {
    id: "t3",
    createdAt: "1 hr ago",
    durationSec: 27,
    text: "The ring buffer approach from Hex is actually genius. They keep one second of audio warm at all times, and on hotkey press they prepend roughly four hundred and fifty milliseconds of it to the file. That's why it catches the first syllable.",
  },
  {
    id: "t4",
    createdAt: "3 hr ago",
    durationSec: 8,
    text: "Okay testing this on VS Code now. Pressing right control, speaking, releasing. Looks clean.",
  },
  {
    id: "t5",
    createdAt: "Yesterday",
    durationSec: 42,
    text: "Long-form test. We want to verify that sherpa-onnx handles three minute clips without running out of memory or chopping off the end. Starting from here: the quick brown fox jumps over the lazy dog, and the pangram continues forever and ever and ever.",
  },
];

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
