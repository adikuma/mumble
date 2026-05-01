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
    <div className="bg-muted border-border flex h-7 items-center gap-0.5 rounded-lg border p-0.5">
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
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
