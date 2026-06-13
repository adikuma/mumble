import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// shared keyboard focus ring, matching the ui/ primitives. apply to raw buttons.
export const focusRing =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** render a hotkey identifier with a space between modifier and key. */
export function formatHotkey(raw: string): string {
  return raw
    .replace(/^Right([A-Z])/, "Right $1")
    .replace(/^Left([A-Z])/, "Left $1");
}

/** format `m:ss` from a duration in seconds. */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
