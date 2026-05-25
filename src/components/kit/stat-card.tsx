import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "bg-card border-border flex min-h-[116px] items-center justify-between rounded-[13px] border p-5",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              {unit}
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-2 text-[12px] font-semibold tracking-[0.07em] uppercase">
          {label}
        </div>
      </div>
      {children}
    </div>
  );
}
