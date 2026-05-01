import { ThemeToggle } from "@/components/theme-toggle";

interface AppHeaderProps {
  title: string;
  meta?: string;
}

/**
 * 44px sticky header. title and optional meta on the left,
 * theme toggle on the right.
 */
export function AppHeader({ title, meta }: AppHeaderProps) {
  return (
    <header className="border-border bg-background flex h-11 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>{title}</span>
        {meta ? (
          <span className="text-muted-foreground text-xs font-normal">
            · {meta}
          </span>
        ) : null}
      </div>
      <ThemeToggle />
    </header>
  );
}
