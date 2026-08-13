"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

const MODES = ["light", "dark", "system"] as const;
type Mode = (typeof MODES)[number];

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const LABELS = { light: "Light", dark: "Dark", system: "System" } as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-10" />;
  }

  const current: Mode = MODES.includes(theme as Mode) ? (theme as Mode) : "system";
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  const Icon = ICONS[current];
  const suffix = current === "system" ? ` (${LABELS[(resolvedTheme as Mode) ?? "light"] ?? "Light"})` : "";

  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${LABELS[current]}${suffix} — switch to ${LABELS[next]}`}
      aria-label={`Theme: ${LABELS[current]}. Switch to ${LABELS[next]} theme`}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-border)] transition-colors"
    >
      <Icon size={18} />
    </button>
  );
}
