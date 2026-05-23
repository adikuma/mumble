import { useEffect } from "react";
import { getAppIcon } from "@/lib/tauri";
import { useMumbleStore } from "@/store";

interface Props {
  exePath?: string | null;
  appName?: string | null;
  size?: number;
}

export function AppIcon({ exePath, appName, size = 14 }: Props) {
  const icon = useMumbleStore((s) => (exePath ? s.appIcons[exePath] : undefined));
  const setAppIcon = useMumbleStore((s) => s.setAppIcon);

  useEffect(() => {
    if (!exePath) return;
    if (icon !== undefined) return;
    getAppIcon(exePath).then((url) => setAppIcon(exePath, url));
  }, [exePath, icon, setAppIcon]);

  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        aria-hidden
        style={{ width: size, height: size }}
        className="rounded-[3px] object-contain"
      />
    );
  }

  const letter = (appName ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground inline-flex items-center justify-center rounded-[3px] font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(8, size - 6) }}
    >
      {letter}
    </span>
  );
}
