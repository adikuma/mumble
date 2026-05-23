import LogoLight from "@/assets/logo-light.svg?react";
import LogoDark from "@/assets/logo-dark.svg?react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className }: LogoProps) {
  const { resolvedTheme } = useTheme();
  const Svg = resolvedTheme === "dark" ? LogoDark : LogoLight;
  return (
    <Svg
      width={size}
      height={size}
      role="img"
      aria-label="Mumble"
      className={cn("shrink-0", className)}
    />
  );
}
