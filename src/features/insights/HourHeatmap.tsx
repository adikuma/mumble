import type { HourHeat } from "@/features/insights/insights-derive";

const ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CELL = 14;
const GAP = 3;

function shade(level: number): string {
  switch (level) {
    case 1:
      return "hsl(var(--primary) / 0.28)";
    case 2:
      return "hsl(var(--primary) / 0.5)";
    case 3:
      return "hsl(var(--primary) / 0.72)";
    case 4:
      return "hsl(var(--primary))";
    default:
      return "hsl(var(--muted-foreground) / 0.14)";
  }
}

function levelOf(count: number, max: number): number {
  if (count <= 0) return 0;
  const q = count / max;
  if (q > 0.75) return 4;
  if (q > 0.5) return 3;
  if (q > 0.25) return 2;
  return 1;
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export function HourHeatmap({ data }: { data: HourHeat }) {
  const { matrix } = data;
  const max = Math.max(1, data.max);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex gap-2">
          {/* weekday labels */}
          <div
            className="flex shrink-0 flex-col"
            style={{ gap: `${GAP}px` }}
          >
            {ROWS.map((r) => (
              <span
                key={r}
                className="text-muted-foreground flex items-center text-[10px] leading-none"
                style={{ height: `${CELL}px` }}
              >
                {r}
              </span>
            ))}
          </div>

          <div>
            <div className="flex flex-col" style={{ gap: `${GAP}px` }}>
              {matrix.map((row, ri) => (
                <div key={ri} className="flex" style={{ gap: `${GAP}px` }}>
                  {row.map((c, ci) => (
                    <div
                      key={ci}
                      className="rounded-[3px]"
                      style={{
                        width: `${CELL}px`,
                        height: `${CELL}px`,
                        backgroundColor: shade(levelOf(c, max)),
                      }}
                      title={`${ROWS[ri]} ${hourLabel(ci)} · ${c} ${c === 1 ? "dictation" : "dictations"}`}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* hour ticks under the grid */}
            <div
              className="text-muted-foreground mt-1.5 flex justify-between text-[10px]"
              style={{ width: `${24 * CELL + 23 * GAP}px` }}
            >
              <span>12a</span>
              <span>6a</span>
              <span>12p</span>
              <span>6p</span>
              <span>11p</span>
            </div>
          </div>
        </div>

        {/* legend */}
        <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[11px]">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: shade(l) }}
            />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
