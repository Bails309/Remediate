"use client";

import { useEffect, useState } from "react";
import { subscribeToToasts, toast, type ToastRecord } from "@/lib/toast";

export function AppToaster() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => subscribeToToasts(setToasts), []);

  return (
    <section aria-live="polite" aria-atomic="true" aria-label="Notifications" className="app-toaster">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={[
            "app-toast",
            `app-toast--${toastItem.variant}`,
            toastItem.closing ? "app-toast--closing" : "",
          ].filter(Boolean).join(" ")}
          role="status"
        >
          <div className="app-toast__content">{toastItem.message}</div>
          <button
            type="button"
            className="app-toast__close"
            aria-label="Dismiss notification"
            onClick={() => toast.dismiss(toastItem.id)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
