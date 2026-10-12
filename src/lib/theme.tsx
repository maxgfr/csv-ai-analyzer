"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import Cookies from "js-cookie";
import { removeLegacyCookie } from "./storage";

export type ThemeMode = "light" | "dark" | "auto";

const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"];
const isThemeMode = (value: unknown): value is ThemeMode =>
  THEME_MODES.includes(value as ThemeMode);

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

/** localStorage key; the anti-flash script in layout.tsx reads the same key. */
export const THEME_STORAGE_KEY = "csv-ai-theme";

/** Saved theme, migrating the cookie used by older versions. */
function loadThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
    const legacy = Cookies.get(THEME_STORAGE_KEY);
    if (legacy !== undefined) {
      removeLegacyCookie(THEME_STORAGE_KEY);
      if (isThemeMode(legacy)) {
        window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
        return legacy;
      }
    }
  } catch {
    // Storage blocked: follow the system preference
  }
  return "auto";
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "auto",
  resolved: "dark",
  setMode: () => {},
});

function resolveTheme(mode: ThemeMode, systemDark: boolean): "light" | "dark" {
  if (mode === "auto") return systemDark ? "dark" : "light";
  return mode;
}

function applyTheme(resolved: "light" | "dark") {
  const html = document.documentElement;
  html.classList.toggle("dark", resolved === "dark");
  html.classList.toggle("light", resolved === "light");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start like the server render ("auto", dark), then read the browser before
  // paint: the landing is pre-rendered, so the first client render must match it
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [systemDark, setSystemDark] = useState(true);
  useLayoutEffect(() => {
    setModeState(loadThemeMode());
    setSystemDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const resolved = resolveTheme(mode, systemDark);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page only
    }
  }, []);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply class to <html> whenever resolved theme changes
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
