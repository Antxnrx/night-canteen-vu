"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the current server page for fresh MongoDB-backed data.
 *
 * A light jitter keeps menu refreshes spread out across visitors.
 */
const POLL_MS = 5000;
const JITTER_MS = 2000;

export function RealtimeRefresh({
  table,
  channel,
}: {
  table: string;
  channel: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(
      () => router.refresh(),
      POLL_MS + Math.random() * JITTER_MS,
    );
    return () => {
      clearInterval(id);
    };
  }, [table, channel, router]);
  return null;
}
