import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/**
 * compact theme toggle. two icon cells inside a rounded lg container.
 * lives in the app header. the sidebar no longer carries this.
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
    <div className="border-border flex h-7 items-center gap-0.5 rounded-[9px] border bg-[hsl(40_8%_90%)] p-[2px] dark:bg-[hsl(240_5%_16%)]">
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
          ? "bg-card text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.14),0_0_0_0.5px_hsl(0_0%_0%/0.05)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
