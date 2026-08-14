"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to changes on a public table and re-renders the current server
 * page when they arrive.
 *
 * Debounced so a burst of changes coalesces into one refresh — and jittered,
 * which matters more than it looks. Every customer on the menu is subscribed to
 * the same table, so a fixed delay means one "sold out" tap sends every phone
 * on campus back to the server inside the same instant. The random spread turns
 * that spike into a few seconds of ordinary traffic.
 */
const DEBOUNCE_MS = 400;
const JITTER_MS = 2600;

export function RealtimeRefresh({
  table,
  channel,
}: {
  table: string;
  channel: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(
        () => {
          timer = null;
          router.refresh();
        },
        DEBOUNCE_MS + Math.random() * JITTER_MS,
      );
    };

    const ch = supabase
      .channel(channel)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [table, channel, router]);
  return null;
}
