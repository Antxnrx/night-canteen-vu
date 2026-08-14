import { NextResponse } from "next/server";
import {
  fetchCashfreeOrder,
  isFreshTimestamp,
  verifyWebhookSignature,
} from "@/lib/cashfree";
import { createAdminClient } from "@/lib/supabase/admin";
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
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Replay guard: a captured delivery can't be resent later.
  if (!isFreshTimestamp(timestamp)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: CashfreeWebhook;
  try {
    event = JSON.parse(raw) as CashfreeWebhook;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const orderId = event.data?.order?.order_id;
  const isSuccess =
    event.type === "PAYMENT_SUCCESS_WEBHOOK" ||
    event.data?.payment?.payment_status === "SUCCESS";

  if (!orderId || !isSuccess) {
    // Ack anything else (failed/dropped payments) so Cashfree stops retrying.
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id,total_paise,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ ok: true });
  if (order.payment_status === "paid") return NextResponse.json({ ok: true });

  // Authoritative check against Cashfree rather than the delivered payload.
  const remote = await fetchCashfreeOrder(orderId);
  if (!remote) {
    // Couldn't confirm — 500 so Cashfree retries rather than dropping it.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (remote.orderStatus !== "PAID") return NextResponse.json({ ok: true });

  if (remote.currency !== "INR" || remote.amountPaise !== order.total_paise) {
    console.error(
      `WEBHOOK AMOUNT MISMATCH on order ${orderId}: ` +
        `expected ${order.total_paise} paise INR, ` +
        `Cashfree reported ${remote.amountPaise} paise ${remote.currency}`,
    );
    return NextResponse.json({ ok: true }); // acked, deliberately not paid
  }

  const paymentId = event.data?.payment?.cf_payment_id;
  await markOrderPaid(orderId, paymentId != null ? String(paymentId) : null);

  return NextResponse.json({ ok: true });
}
