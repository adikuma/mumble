import { WpmGauge } from "@/components/kit/wpm-gauge";

const DASH = "—";

export function SpeakingPaceCard({
  wpm,
  fastest,
  latencyMs,
}: {
  wpm: number | null;
  fastest: number | null;
  latencyMs: number | null;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-2">
      <div className="relative flex justify-center">
        <WpmGauge wpm={wpm} size={210} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <div className="text-stat leading-none font-semibold tabular-nums">
            {wpm ?? DASH}
          </div>
          <div className="text-muted-foreground mt-1.5 text-sm">
            words / min
          </div>
        </div>
      </div>

      <div className="mt-6 grid w-full max-w-[280px] grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-[0.07em] uppercase">
            Fastest
          </div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">
            {fastest ?? DASH}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-[0.07em] uppercase">
            Latency
          </div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">
            {latencyMs != null ? `${latencyMs}ms` : DASH}
          </div>
        </div>
      </div>
    </div>
  );
}
