import "server-only";
import { createAdminClient } from "@/lib/mongodb/client";

/**
 * Housekeeping, run just before the board is read.
 *
 * Retires Ready orders past their window (so the cook never taps "collected")
 * and cancels UPI checkouts abandoned at the payment sheet. Both live in one
 * SQL function so this is a single round trip on a hot path.
 *
 * Best-effort by design: if it fails, the board still renders — it just shows a
 * couple of stale cards until the next tick. Never let housekeeping take down
 * the screen the kitchen depends on.
 */
const MIN_INTERVAL_MS = 20_000;
let lastSweptAt = 0;

export async function sweepOrders(): Promise<void> {
  // The board polls every 5s per staff device. Throttling per instance keeps
  // that from turning into a steady stream of pointless UPDATEs. Instances are
  // reused between invocations, and the failure mode is simply sweeping more
  // often than intended — harmless.
  const since = Date.now() - lastSweptAt;
  if (since < MIN_INTERVAL_MS) return;
  lastSweptAt = Date.now();

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("sweep_orders", {
      p_ready_minutes: 10,
      p_abandon_minutes: 30,
    });
    if (error) console.error("sweep_orders failed:", error.message);
  } catch (e) {
    console.error("sweep_orders threw:", e);
  }
}
