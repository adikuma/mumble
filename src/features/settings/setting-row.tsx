import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  title: string;
  desc?: string;
  children: ReactNode;
}

export function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="border-border flex flex-col gap-3 border-b px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {desc ? (
          <div className="text-muted-foreground mt-0.5 text-[14px]">{desc}</div>
        ) : null}
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
        {children}
      </div>
    </div>
  );
}

interface SettingControlProps {
  children: ReactNode;
  className?: string;
  width?: "sm" | "md" | "lg";
}

const settingControlWidths = {
  sm: "sm:w-32",
  md: "sm:w-56",
  lg: "sm:w-72",
};

export function SettingControl({
  children,
  className,
  width = "md",
}: SettingControlProps) {
  return (
    <div
      className={cn("w-full min-w-0", settingControlWidths[width], className)}
    >
      {children}
    </div>
  );
}
