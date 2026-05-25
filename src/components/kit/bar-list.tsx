interface BarEntry {
  label: string;
  count: number;
}

export function BarList({ entries }: { entries: BarEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">Nothing yet.</p>;
  }
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <div>
      {entries.map((e, i) => (
        <div
          key={`${e.label}-${i}`}
          className="flex items-center gap-3 py-2 text-sm"
        >
          <span className="w-[120px] truncate">{e.label}</span>
          <span className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-primary absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(e.count / max) * 100}%` }}
            />
          </span>
          <span className="text-muted-foreground w-6 text-right tabular-nums">
            {e.count}
          </span>
        </div>
      ))}
    </div>
  );
}
