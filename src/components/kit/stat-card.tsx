import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MetaLabel, Surface } from "@/components/kit/layout";

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  className?: string;
  children?: ReactNode;
}

export function StatCard({
  label,
  value,
  unit,
  className,
  children,
}: StatCardProps) {
  return (
    <Surface
      className={cn(
        "flex min-h-[116px] items-center justify-between p-5",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-stat leading-none font-semibold tabular-nums">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              {unit}
            </span>
          ) : null}
        </div>
        <MetaLabel className="mt-2 block">{label}</MetaLabel>
      </div>
      {children}
    </Surface>
  );
}
