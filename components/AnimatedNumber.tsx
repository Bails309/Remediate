"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  className?: string;
  /** Count-up duration in milliseconds. */
  durationMs?: number;
};

function prefersInstant(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animate a number counting up to `value` on mount and whenever it changes.
 * Uses requestAnimationFrame with an ease-out curve. When reduced motion is
 * preferred (or there is no `matchMedia`, e.g. SSR/tests) it renders `value`
 * directly with no animation.
 */
export function AnimatedNumber({ value, className, durationMs = 900 }: Props) {
  const [instant] = useState(prefersInstant);
  const [display, setDisplay] = useState(() => (instant ? value : 0));
  const fromRef = useRef(0);

  useEffect(() => {
    if (instant) return;

    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, instant]);

  return <span className={className}>{(instant ? value : display).toLocaleString()}</span>;
}
