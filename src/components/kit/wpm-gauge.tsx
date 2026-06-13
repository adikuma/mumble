interface WpmGaugeProps {
  wpm: number | null;
  // rendered width in px. height scales with the 104:62 viewbox.
  size?: number;
}

// half circle meter. the arc fills proportional to wpm against a 200 wpm
// ceiling, a comfortable upper bound for sustained dictation.
export function WpmGauge({ wpm, size = 104 }: WpmGaugeProps) {
  const pct = wpm == null ? 0 : Math.max(0, Math.min(1, wpm / 200));
  const cx = 52;
  const cy = 54;
  const r = 44;
  const angle = Math.PI * (1 - pct);
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const height = (size * 62) / 104;
  const stroke = 12;
  return (
    <svg
      viewBox="0 0 104 62"
      width={size}
      height={height}
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M8 54 A44 44 0 0 1 96 54"
        fill="none"
        style={{ stroke: "hsl(var(--muted-foreground) / 0.22)" }}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {pct > 0 ? (
        <path
          d={`M8 54 A44 44 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`}
          fill="none"
          style={{ stroke: "hsl(var(--primary))" }}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
