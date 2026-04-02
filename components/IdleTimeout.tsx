"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { Clock } from "lucide-react";

const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes (OWASP recommendation)
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Show warning 2 minutes before sign-out
const WARNING_AT_MS = IDLE_TIMEOUT_MS - WARNING_BEFORE_MS;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

export function IdleTimeout() {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/revoke", { method: "POST" }).catch(() => {});
    signOut({ callbackUrl: "/login" });
  }, []);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setSecondsLeft(120);

    // Start warning timer (fires at 18 minutes)
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(120);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, WARNING_AT_MS);

    // Start logout timer (fires at 20 minutes)
    idleTimerRef.current = setTimeout(handleLogout, IDLE_TIMEOUT_MS);
  }, [handleLogout, clearAllTimers]);

  useEffect(() => {
    resetTimer();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      clearAllTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [resetTimer, clearAllTimers]);

  if (!showWarning) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-amber-500 text-black px-4 py-3 text-sm font-medium shadow-lg animate-in slide-in-from-top duration-300">
      <Clock size={16} className="mr-2 shrink-0" />
      <span>
        Your session will expire due to inactivity in{" "}
        <strong>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </strong>
      </span>
      <button
        onClick={resetTimer}
        className="ml-4 rounded-md bg-black/20 px-3 py-1 text-xs font-semibold hover:bg-black/30 transition-colors"
      >
        Stay Signed In
      </button>
    </div>
  );
}
