"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the current server component on an interval so a Server Component
 * page reflects live changes (used for the customer order status).
 *
 * Every waiting customer runs this at once, and each tick is a full server
 * render, so the interval is jittered: without it, everyone who ordered in the
 * same minute lands on the server in the same instant for the rest of their
 * wait. Pauses while the tab is hidden and stops once `stop` is true.
 */
export function AutoRefresh({
  intervalMs = 5000,
  jitterMs = 1500,
  stop = false,
}: {
  intervalMs?: number;
  jitterMs?: number;
  stop?: boolean;
}) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stop) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") router.refresh();
      schedule();
    };

    const schedule = () => {
      timeoutRef.current = setTimeout(tick, intervalMs + Math.random() * jitterMs);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [router, intervalMs, jitterMs, stop]);

  return null;
}
