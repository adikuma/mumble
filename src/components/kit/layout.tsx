import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageProps {
  children: ReactNode;
  className?: string;
}

export function Page({ children, className }: PageProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[980px] px-9 pb-9", className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "bg-background border-border sticky top-0 z-10 -mx-9 border-b px-9 pt-6 pb-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title leading-tight font-semibold">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-1.5 text-sm">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

interface SurfaceProps {
  children: ReactNode;
  className?: string;
}

export function Surface({ children, className }: SurfaceProps) {
  return (
    <div
      className={cn(
        "bg-card border-border overflow-hidden rounded-xl border",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <h2
      className={cn(
        "text-muted-foreground mb-3 text-xs font-semibold tracking-[0.07em] uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

interface MetaLabelProps {
  children: ReactNode;
  className?: string;
}

export function MetaLabel({ children, className }: MetaLabelProps) {
  return (
    <span
      className={cn(
        "text-muted-foreground text-xs font-semibold tracking-[0.07em] uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface SettingSectionProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingSection({
  title,
  children,
  className,
}: SettingSectionProps) {
  return (
    <section className={className}>
      <SectionLabel>{title}</SectionLabel>
      <Surface>{children}</Surface>
    </section>
  );
}

interface AppGridProps {
  children: ReactNode;
  className?: string;
  columns?: "stats" | "two";
}

export function AppGrid({
  children,
  className,
  columns = "two",
}: AppGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        columns === "stats" ? "md:grid-cols-3" : "md:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
