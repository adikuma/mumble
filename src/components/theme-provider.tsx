import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

// resolve the system media query lazily so the module can be imported in
// non-dom environments (ssr, test, vite prerender). returns null when there
// is no window available.
function getSystemMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function getSystemTheme(): "light" | "dark" {
  const mq = getSystemMediaQuery();
  return mq?.matches ? "dark" : "light";
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  resolvedTheme: getSystemTheme(),
  setTheme: () => null,
});

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "mumble-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    getSystemTheme,
  );

  useEffect(() => {
    const mq = getSystemMediaQuery();
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // keep theme in sync across windows. the indicator pill lives in its own
  // tauri webview, so when the main window flips the theme we hear the shared
  // localstorage change here and update too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTheme(e.newValue as Theme);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      root.classList.add(systemTheme);
      return;
    }
    root.classList.add(theme);
  }, [theme, systemTheme]);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? systemTheme : theme;

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme: (t) => {
          localStorage.setItem(storageKey, t);
          setTheme(t);
        },
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeProviderContext);
