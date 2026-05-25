import type { ReactNode } from "react";

interface SettingRowProps {
  title: string;
  desc?: string;
  children: ReactNode;
}

export function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {desc ? (
          <div className="text-muted-foreground mt-0.5 text-[13px]">{desc}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
