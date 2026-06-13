interface SparklineProps {
  points: number[];
  height?: number;
}

// tiny inline trend line that fills its container width. stroke stays crisp
// under non-uniform scaling via vector-effect.
export function Sparkline({ points, height = 30 }: SparklineProps) {
  const W = 120;
  const H = height;
  const pad = 4;

  if (points.length < 2) {
    const y = H - pad;
    return (
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1="0"
          y1={y}
          x2={W}
          y2={y}
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.45"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = W / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = pad + (H - pad * 2) * (1 - (p - min) / range);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={line}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
