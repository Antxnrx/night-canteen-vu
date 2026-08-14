import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DB-backed fixed-window rate limiting.
 *
 * In-memory counters are useless here: every Vercel instance would keep its own
 * tally, so the real limit is (limit × instances). The counter lives in Postgres
 * and is bumped inside a single atomic statement instead.
 *
 * Fails OPEN. If the limiter itself is broken we would rather serve a few extra
 * orders than refuse a paying customer standing at the truck.
 */
export async function allow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("bump_rate_limit failed:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("bump_rate_limit threw:", e);
    return true;
  }
}

/**
 * Best-effort client IP. On Vercel `x-forwarded-for` is set by the edge and the
 * first entry is the real client. Falls back to a shared bucket, which is the
 * safe direction: unknown clients throttle each other rather than going free.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}
