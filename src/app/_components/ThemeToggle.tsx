"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "~/lib/theme";

const modes: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "auto", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] p-1"
    >
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          className={`rounded-lg p-1.5 transition-colors ${
            mode === value
              ? "bg-violet-600 text-white shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title={label}
          aria-label={`Switch to ${label} theme`}
          aria-pressed={mode === value}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
