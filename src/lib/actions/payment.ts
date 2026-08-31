"use server";

import { createAdminClient } from "@/lib/mongodb/client";
import { fetchCashfreeOrder } from "@/lib/cashfree";
import { markOrderPaid } from "@/lib/payments";

export type VerifyPaymentResult = { ok: boolean; error?: string };

/**
 * Confirms a payment after the customer returns from Cashfree checkout.
 *
 * Cashfree has no client-side signature to check, which turns out to be the
 * safer shape: nothing the browser sends is trusted at all. The browser only
 * tells us *when* to look — the answer comes from Cashfree's API, server to
 * server, keyed on our own order id.
 *
 * Three things must hold before an order is marked paid: Cashfree says PAID,
 * the currency is INR, and the amount matches the total we computed. The last
 * one is what stops a tampered or stale session from paying ₹1 for a ₹400 order.
 *
 * The webhook performs the identical checks; whichever arrives first wins, and
 * markOrderPaid is idempotent.
 */
export async function verifyPayment(
  orderId: string,
): Promise<VerifyPaymentResult> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id,total_paise,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "We couldn't find that order." };
  if (order.payment_status === "paid") return { ok: true }; // webhook beat us

  const remote = await fetchCashfreeOrder(orderId);
  if (!remote) {
    return {
      ok: false,
      error: "We couldn't reach the payment provider. Check your order page in a moment.",
    };
  }

  if (remote.orderStatus !== "PAID") {
    return { ok: false, error: "Payment wasn't completed." };
  }
  if (remote.currency !== "INR" || remote.amountPaise !== order.total_paise) {
    console.error(
      `PAYMENT AMOUNT MISMATCH on order ${orderId}: ` +
        `expected ${order.total_paise} paise INR, ` +
        `Cashfree reported ${remote.amountPaise} paise ${remote.currency}`,
    );
    return { ok: false, error: "Payment amount didn't match this order." };
  }

  await markOrderPaid(orderId, null);
  return { ok: true };
}
