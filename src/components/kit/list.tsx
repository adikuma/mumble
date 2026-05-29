import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ListRowProps {
  children: ReactNode;
  className?: string;
}

export function ListRow({ children, className }: ListRowProps) {
  return (
    <div
      className={cn(
        "border-border group flex min-w-0 items-center gap-3.5 border-b px-4 py-4 text-sm last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface ListMetaProps {
  children: ReactNode;
  className?: string;
}

export function ListMeta({ children, className }: ListMetaProps) {
  return (
    <span
      className={cn(
        "text-muted-foreground shrink-0 truncate text-xs tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface ListChipProps {
  children: ReactNode;
  className?: string;
}

export function ListChip({ children, className }: ListChipProps) {
  return (
    <span
      className={cn(
        "bg-muted rounded-md px-2 py-0.5 text-xs tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}
