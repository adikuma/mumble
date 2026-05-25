import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/**
 * compact theme toggle. two icon cells inside a rounded container. lives in the
 * settings page under appearance.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // resolve "system" to its current effective value so the right cell
  // highlights even when the user hasn't explicitly chosen.
  const effective: "light" | "dark" =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  return (
    <div className="bg-muted border-border flex h-7 items-center gap-0.5 rounded-[8px] border p-[2px]">
      <Cell
        active={effective === "light"}
        onClick={() => setTheme("light")}
        label="Light"
      >
        <Sun className="size-3" strokeWidth={2} />
      </Cell>
      <Cell
        active={effective === "dark"}
        onClick={() => setTheme("dark")}
        label="Dark"
      >
        <Moon className="size-3" strokeWidth={2} />
      </Cell>
    </div>
  );
}

function Cell({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-6 w-7 items-center justify-center rounded-md transition-colors",
        active
          ? "text-foreground dark:text-background bg-white dark:bg-white"
          : "text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-card",
      )}
    >
      {children}
    </button>
  );
}
