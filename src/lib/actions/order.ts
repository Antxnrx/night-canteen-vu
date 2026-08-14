"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSession } from "@/lib/session";
import { isSupabaseConfigured, isRazorpayConfigured } from "@/lib/env";
import { createRazorpayOrder, razorpayKeyId } from "@/lib/razorpay";
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
      razorpayOrderId: string;
      amountPaise: number;
      keyId: string;
      customerName: string;
      phone: string | null;
    };

/**
 * Creates (or re-uses, for retries) a pending order + its Razorpay order.
 * ALL pricing is recomputed server-side; the client only sends ids + quantities.
 * Idempotent on `idempotencyKey`, so a retry re-opens payment for the same order.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Ordering isn't available yet. Please try again later." };
  }

  const method: "upi" | "cash" =
    input.paymentMethod === "cash" ? "cash" : "upi";
  if (method === "upi" && !isRazorpayConfigured()) {
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
      const rzpId = await ensureRazorpayOrder(supabase, existing.id, existing.razorpay_order_id, existing.total_paise);
      if (!rzpId) return { error: "Couldn't start the payment. Please try again." };
      return {
        orderId: existing.id,
        razorpayOrderId: rzpId,
        amountPaise: existing.total_paise,
        keyId: razorpayKeyId(),
        customerName: existing.customer_name,
        phone: existing.customer_phone,
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

  const rzpId = await ensureRazorpayOrder(supabase, order.id, null, total);
  if (!rzpId) {
    // Order persists as pending; a retry (same key) will re-attempt payment.
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    orderId: order.id,
    razorpayOrderId: rzpId,
    amountPaise: total,
    keyId: razorpayKeyId(),
    customerName: name,
    phone,
  };
}

/** Returns the order's Razorpay order id, creating + storing it if needed. */
async function ensureRazorpayOrder(
  supabase: SupabaseClient,
  orderId: string,
  existingRazorpayOrderId: string | null,
  amountPaise: number,
): Promise<string | null> {
  if (existingRazorpayOrderId) return existingRazorpayOrderId;
  const rzp = await createRazorpayOrder(amountPaise, orderId);
  if (!rzp) return null;
  await supabase
    .from("orders")
    .update({ razorpay_order_id: rzp.id })
    .eq("id", orderId);
  return rzp.id;
}
