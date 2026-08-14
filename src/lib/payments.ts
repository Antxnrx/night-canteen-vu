import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marks an order paid and moves it into the kitchen queue. Idempotent and safe
 * under races: the status flip is an atomic claim (only the first caller wins),
 * and the daily order number is assigned exactly once. Called by both the
 * client-verify path and the webhook — whichever confirms first.
 */
export async function markOrderPaid(
  orderId: string,
  paymentId: string | null,
): Promise<void> {
  const supabase = createAdminClient();

  // Atomic claim: only rows not already paid are updated. A concurrent second
  // caller re-evaluates the filter after the row lock and updates 0 rows.
  const { data: claimed } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      status: "new",
      paid_at: new Date().toISOString(),
      razorpay_payment_id: paymentId,
    })
    .eq("id", orderId)
    .neq("payment_status", "paid")
    .select("id,daily_order_number")
    .maybeSingle();

  if (!claimed) return; // already paid — nothing to do

  if (claimed.daily_order_number == null) {
    await assignOrderNumber(supabase, orderId);
  }
}

/**
 * Assigns the daily order number. This is the number staff shout across the
 * counter, so an order without one is genuinely broken for the customer even
 * though their money went through — worth one retry and a loud log rather than
 * a swallowed error.
 */
export async function assignOrderNumber(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<number | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data: num, error } = await supabase.rpc("next_daily_order_number");
    if (!error && typeof num === "number") {
      await supabase
        .from("orders")
        .update({ daily_order_number: num })
        .eq("id", orderId);
      return num;
    }
    console.error(
      `next_daily_order_number failed (attempt ${attempt}/2) for order ${orderId}:`,
      error?.message ?? "unexpected return value",
    );
  }
  // Paid but unnumbered. The board shows these as "—" so staff can still find
  // the order by name; check the service_role grant from migration 0008.
  console.error(`ORDER ${orderId} IS PAID BUT HAS NO ORDER NUMBER`);
  return null;
}
