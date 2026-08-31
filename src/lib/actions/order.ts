"use server";

import { createAdminClient } from "@/lib/mongodb/client";
import { ensureSession } from "@/lib/session";
import { isMongoConfigured, isCashfreeConfigured } from "@/lib/env";
import { env } from "@/lib/env";
import { createCashfreeOrder, fetchCashfreeOrder } from "@/lib/cashfree";
import { getStoreOpen } from "@/lib/store";
import { priceLines } from "@/lib/pricing";
import { allow, clientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export type CreateOrderInput = {
  items: { id: string; variantId?: string | null; qty: number }[];
  name: string;
  phone?: string;
  paymentMethod: "upi" | "cash";
  idempotencyKey: string;
};

export type CreateOrderResult =
  | { error: string }
  | { alreadyPaid: true; orderId: string }
  | { cash: true; orderId: string }
  | {
      orderId: string;
      /** Handed to the Cashfree JS SDK to open checkout. */
      paymentSessionId: string;
      amountPaise: number;
      mode: "sandbox" | "production";
    };

/**
 * Creates (or re-uses, for retries) a pending order + its Cashfree order.
 * ALL pricing is recomputed server-side; the client only sends ids + quantities.
 * Idempotent on `idempotencyKey`, so a retry re-opens payment for the same order.
 *
 * Our order UUID is also Cashfree's `order_id`, so payment can always be looked
 * up later without storing a second identifier.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (!isMongoConfigured()) {
    return { error: "Ordering isn't available yet. Please try again later." };
  }

  const method: "upi" | "cash" =
    input.paymentMethod === "cash" ? "cash" : "upi";
  if (method === "upi" && !isCashfreeConfigured()) {
    return { error: "UPI payments aren't set up yet. Please try again soon." };
  }

  if (!(await getStoreOpen())) {
    return {
      error: "The canteen just closed — you can't place an order right now.",
    };
  }


  const name = (input.name ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (name.length > 60) return { error: "That name is too long." };

  const phone = (input.phone ?? "").trim();
  if (!phone) return { error: "Please enter your phone number." };
  if (!/^[0-9+\-\s]{6,15}$/.test(phone)) {
    return { error: "Enter a valid phone number." };
  }

  const supabase = createAdminClient();

  // Retry path: same idempotency key → same order (re-open its payment).
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("orders")
      .select(
        "id,total_paise,payment_status,payment_method,razorpay_order_id,customer_name,customer_phone",
      )
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      if (existing.payment_status === "paid") {
        return { alreadyPaid: true, orderId: existing.id };
      }
      if (existing.payment_method === "cash") {
        return { cash: true, orderId: existing.id };
      }
      const session = await ensurePaymentSession(supabase, {
        orderId: existing.id,
        alreadyCreated: Boolean(existing.razorpay_order_id),
        amountPaise: existing.total_paise,
        customerName: existing.customer_name,
        customerPhone: existing.customer_phone ?? phone,
      });
      if (!session) {
        return { error: "Couldn't start the payment. Please try again." };
      }
      return {
        orderId: existing.id,
        paymentSessionId: session,
        amountPaise: existing.total_paise,
        mode: env.cashfreeEnv,
      };
    }
  }

  // Past the retry path, so this only ever counts genuinely NEW orders — a
  // customer re-opening payment on bad wifi reuses their idempotency key above
  // and is never the one who gets throttled.
  //
  // Cash orders reach the board without any payment, so without a limit one
  // person can bury the kitchen in junk. Keyed on the session where there is
  // one, otherwise the IP: a fresh session per request would defeat the first
  // bucket on its own.
  const existingSession = await getSession();
  const bucket = existingSession
    ? `order:s:${existingSession.id}`
    : `order:ip:${await clientIp()}`;
  if (!(await allow(bucket, 8, 300))) {
    return {
      error: "That's a lot of orders at once. Give it a minute, then try again.",
    };
  }

  // Server-side pricing (shared with counter billing).
  const priced = await priceLines(supabase, input.items);
  if (!priced.ok) {
    return {
      error:
        priced.error === "No items selected."
          ? "Your cart is empty."
          : priced.error,
    };
  }
  const { orderItems, subtotalPaise: subtotal } = priced;
  const total = subtotal; // no taxes/fees in v1

  let session: Awaited<ReturnType<typeof ensureSession>>;
  try {
    session = await ensureSession(name, phone);
  } catch (e) {
    console.error("createOrder: could not create session:", e);
    return { error: "Couldn't place your order. Please try again." };
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      session_id: session.id,
      customer_name: name,
      customer_phone: phone,
      status: "pending_payment",
      payment_status: "created",
      payment_method: method,
      subtotal_paise: subtotal,
      total_paise: total,
      idempotency_key: input.idempotencyKey || null,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return createOrder(input); // rare race — restart on the retry path
    }
    return { error: "Couldn't place your order. Please try again." };
  }

  const { error: itemsInsertErr } = await supabase
    .from("order_items")
    .insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })));
  if (itemsInsertErr) {
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: "Couldn't place your order. Please try again." };
  }

  // Cash: order waits on the board for staff to confirm receipt.
  if (method === "cash") {
    return { cash: true, orderId: order.id };
  }

  const paymentSession = await ensurePaymentSession(supabase, {
    orderId: order.id,
    alreadyCreated: false,
    amountPaise: total,
    customerName: name,
    customerPhone: phone,
  });
  if (!paymentSession) {
    // Order persists as pending; a retry (same key) will re-attempt payment.
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    orderId: order.id,
    paymentSessionId: paymentSession,
    amountPaise: total,
    mode: env.cashfreeEnv,
  };
}

/**
 * Returns a usable Cashfree payment session for this order.
 *
 * A payment session expires, so a retry can't just replay the old one — but the
 * Cashfree order itself still exists and its id is our order UUID, so fetching
 * it yields a fresh session. Only when no Cashfree order exists yet do we
 * create one (creating twice with the same order_id is rejected).
 *
 * NOTE ON THE COLUMN NAME: `razorpay_order_id` is reused as the "a payment
 * order exists for this row" marker. Renaming it would mean a schema change,
 * which was explicitly off the table for this launch. It holds a Cashfree
 * identifier despite the name.
 */
async function ensurePaymentSession(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    orderId: string;
    alreadyCreated: boolean;
    amountPaise: number;
    customerName: string;
    customerPhone: string;
  },
): Promise<string | null> {
  if (params.alreadyCreated) {
    const remote = await fetchCashfreeOrder(params.orderId);
    if (remote?.paymentSessionId) return remote.paymentSessionId;
    // Order exists but is no longer payable (expired/terminated) — nothing to
    // resume, and re-creating under the same id would be rejected.
    return null;
  }

  const created = await createCashfreeOrder({
    orderId: params.orderId,
    amountPaise: params.amountPaise,
    // Cashfree requires a customer id; our order id is stable and unique.
    customerId: params.orderId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
  });
  if (!created) return null;

  await supabase
    .from("orders")
    .update({ razorpay_order_id: created.cfOrderId || params.orderId })
    .eq("id", params.orderId);

  return created.paymentSessionId;
}
