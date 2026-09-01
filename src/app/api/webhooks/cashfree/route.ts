import { NextResponse } from "next/server";
import {
  fetchCashfreeOrder,
  isFreshTimestamp,
  verifyWebhookSignature,
} from "@/lib/cashfree";
import { createAdminClient } from "@/lib/mongodb/client";
import { markOrderPaid } from "@/lib/payments";

export const dynamic = "force-dynamic";

type CashfreeWebhook = {
  type?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: { cf_payment_id?: string | number; payment_status?: string };
  };
};

/**
 * Cashfree webhook — the server-to-server source of truth for payment.
 *
 * This is what covers the customer who pays and immediately locks their phone:
 * their browser never comes back to confirm, so without this the money is taken
 * and no order reaches the kitchen.
 *
 * The payload is verified, then deliberately NOT trusted for the amount. We
 * re-fetch the order from Cashfree and check status, currency and total against
 * our own figure before marking anything paid.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";

  if (!verifyWebhookSignature(raw, timestamp, signature)) {
    console.error("[Cashfree Webhook] Invalid signature received.");
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  // Replay guard: a captured delivery can't be resent later.
  if (!isFreshTimestamp(timestamp)) {
    console.error("[Cashfree Webhook] Stale timestamp received:", timestamp);
    return NextResponse.json({ ok: false, error: "stale_timestamp" }, { status: 400 });
  }

  let event: CashfreeWebhook;
  try {
    event = JSON.parse(raw) as CashfreeWebhook;
  } catch {
    console.error("[Cashfree Webhook] Malformed JSON payload.");
    return NextResponse.json({ ok: false, error: "malformed_json" }, { status: 400 });
  }

  const orderId =
    event.data?.order?.order_id ??
    (event as unknown as { order_id?: string }).order_id;
  const isSuccess =
    event.type === "PAYMENT_SUCCESS_WEBHOOK" ||
    event.data?.payment?.payment_status === "SUCCESS";

  console.log(`[Cashfree Webhook] Received event '${event.type}' for order: ${orderId ?? "unknown"}`);

  if (!orderId || !isSuccess) {
    // Ack anything else (failed/dropped payments) so Cashfree stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id,total_paise,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.warn(`[Cashfree Webhook] Order ${orderId} not found in database.`);
    return NextResponse.json({ ok: true, not_found: true });
  }
  if (order.payment_status === "paid") {
    console.log(`[Cashfree Webhook] Order ${orderId} is already marked paid.`);
    return NextResponse.json({ ok: true, already_paid: true });
  }

  // Authoritative check against Cashfree rather than the delivered payload.
  const remote = await fetchCashfreeOrder(orderId);
  if (!remote) {
    // Couldn't confirm — 500 so Cashfree retries rather than dropping it.
    console.error(`[Cashfree Webhook] Could not fetch order ${orderId} from Cashfree API.`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (remote.orderStatus !== "PAID") {
    console.log(`[Cashfree Webhook] Cashfree reported status '${remote.orderStatus}' for order ${orderId}.`);
    return NextResponse.json({ ok: true, status: remote.orderStatus });
  }

  if (remote.currency !== "INR" || remote.amountPaise !== order.total_paise) {
    console.error(
      `[Cashfree Webhook] AMOUNT MISMATCH on order ${orderId}: ` +
        `expected ${order.total_paise} paise INR, ` +
        `Cashfree reported ${remote.amountPaise} paise ${remote.currency}`,
    );
    return NextResponse.json({ ok: true, mismatch: true }); // acked, deliberately not paid
  }

  const paymentId = event.data?.payment?.cf_payment_id;
  await markOrderPaid(orderId, paymentId != null ? String(paymentId) : null);
  console.log(`[Cashfree Webhook] Order ${orderId} marked PAID successfully.`);

  return NextResponse.json({ ok: true });
}
