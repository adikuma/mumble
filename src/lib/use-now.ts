import { useEffect, useState } from "react";

/**
 * returns a ticking timestamp from a setinterval driven effect.
 * the initial value is captured once on mount so render stays pure.
 * call sites should treat the number as a recently sampled `date.now()`.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
