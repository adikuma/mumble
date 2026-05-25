import { AppIcon } from "@/features/history/AppIcon";

interface AppEntry {
  name: string;
  path: string | null;
  count: number;
}

export function AppIconGrid({ apps }: { apps: AppEntry[] }) {
  if (apps.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">No apps yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-5">
      {apps.map((a) => (
        <div key={a.name} className="flex w-20 flex-col items-center gap-2">
          <div className="relative">
            <div className="bg-card flex size-12 items-center justify-center overflow-hidden rounded-[11px]">
              <AppIcon exePath={a.path} appName={a.name} size={28} />
            </div>
            <span className="bg-primary text-primary-foreground border-accent absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 text-[12px] font-bold tabular-nums">
              {a.count}
            </span>
          </div>
          <span className="text-muted-foreground max-w-full truncate text-xs">
            {a.name}
          </span>
        </div>
      ))}
    </div>
  );
}
