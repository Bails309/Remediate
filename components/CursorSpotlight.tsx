"use client";

import { useEffect } from "react";

/**
 * Mount once near the app root. Tracks the pointer and, for any element with
 * the `.spotlight` class it hovers, updates `--spot-x` / `--spot-y` so the
 * CSS radial sheen follows the cursor. Purely presentational; no state.
 */
export function CursorSpotlight() {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.(
        ".spotlight",
      ) as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
      target.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    };

    window.addEventListener("pointermove", handler, { passive: true });
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  return null;
}
