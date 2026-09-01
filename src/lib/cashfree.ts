import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Cashfree Payments (PG API v3).
 *
 * Two things differ from a Razorpay-shaped integration and both matter:
 *
 * 1. AMOUNTS ARE RUPEES, NOT PAISE. Cashfree takes `order_amount` as a decimal
 *    (149.00). We store integer paise everywhere else and only convert at this
 *    boundary — and we convert back and re-check on the way in, so a mismatch
 *    can never be mistaken for a valid payment.
 *
 * 2. THERE IS NO CLIENT-SIDE SIGNATURE. Razorpay hands the browser a signed
 *    blob to post back; Cashfree does not. Confirmation instead means asking
 *    Cashfree's API, server to server, what the order's status is. That is
 *    strictly safer: nothing the browser sends is trusted at all.
 */

const API_VERSION = "2026-01-01";

function apiBase(): string {
  return env.cashfreeEnv === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function authHeaders(): Record<string, string> {
  return {
    "x-api-version": API_VERSION,
    "x-client-id": env.cashfreeAppId,
    "x-client-secret": env.cashfreeSecretKey,
    "Content-Type": "application/json",
  };
}

/** Integer paise → the rupee decimal Cashfree expects. */
export function paiseToRupees(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

/** Rupee decimal from Cashfree → integer paise, rounded to kill float dust. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export type CashfreeOrder = {
  paymentSessionId: string;
  cfOrderId: string;
};

/**
 * Creates a Cashfree order for exactly `amountPaise`. `orderId` is our own
 * order UUID, which becomes Cashfree's `order_id` so we can look the payment up
 * later without storing a second identifier.
 */
export async function createCashfreeOrder(params: {
  orderId: string;
  amountPaise: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  returnUrl?: string;
}): Promise<CashfreeOrder | null> {
  try {
    const res = await fetch(`${apiBase()}/orders`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        order_id: params.orderId,
        order_amount: paiseToRupees(params.amountPaise),
        order_currency: "INR",
        customer_details: {
          customer_id: params.customerId,
          customer_name: params.customerName,
          customer_phone: params.customerPhone,
        },
        order_note: "Night Canteen",
        ...(params.returnUrl
          ? { order_meta: { return_url: params.returnUrl } }
          : {}),
      }),
    });

    if (!res.ok) {
      console.error(
        "cashfree order create failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }

    const data = (await res.json()) as {
      payment_session_id?: string;
      cf_order_id?: string | number;
    };
    if (!data.payment_session_id) {
      console.error("cashfree order create: no payment_session_id in response");
      return null;
    }
    return {
      paymentSessionId: data.payment_session_id,
      cfOrderId: String(data.cf_order_id ?? ""),
    };
  } catch (e) {
    console.error("cashfree order create threw:", e);
    return null;
  }
}

export type CashfreeStatus = {
  /** ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED */
  orderStatus: string;
  amountPaise: number;
  currency: string;
  /** Present while the order is still payable — used to resume a retry. */
  paymentSessionId: string | null;
};

/**
 * Asks Cashfree what actually happened to an order. This is the only thing that
 * marks an order paid on the customer-return path — the browser is never
 * trusted, it merely tells us when to go and look.
 */
export async function fetchCashfreeOrder(
  orderId: string,
): Promise<CashfreeStatus | null> {
  try {
    const res = await fetch(
      `${apiBase()}/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers: authHeaders(), cache: "no-store" },
    );
    if (!res.ok) {
      console.error(
        "cashfree order fetch failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    const data = (await res.json()) as {
      order_status?: string;
      order_amount?: number;
      order_currency?: string;
      payment_session_id?: string;
    };
    if (!data.order_status) return null;
    return {
      orderStatus: data.order_status,
      amountPaise: rupeesToPaise(Number(data.order_amount ?? 0)),
      currency: data.order_currency ?? "",
      paymentSessionId: data.payment_session_id ?? null,
    };
  } catch (e) {
    console.error("cashfree order fetch threw:", e);
    return null;
  }
}

/**
 * Verifies a webhook: base64(HMAC-SHA256(timestamp + rawBody)) keyed with the
 * client secret, per Cashfree's reference implementation. The raw body must
 * be the exact bytes received — re-serialising parsed JSON changes the hash.
 */
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  if (!env.cashfreeSecretKey || !timestamp || !signature) {
    console.warn("verifyWebhookSignature: Missing secretKey, timestamp, or signature header.");
    return false;
  }
  const expected = createHmac("sha256", env.cashfreeSecretKey)
    .update(timestamp + rawBody)
    .digest("base64");
  const valid = safeEqual(expected, signature);
  if (!valid) {
    console.warn("verifyWebhookSignature: Signature mismatch.");
  }
  return valid;
}

/**
 * Rejects webhooks older than five minutes so a captured delivery can't be
 * replayed later. Handles both second and millisecond timestamps from Cashfree.
 */
export function isFreshTimestamp(timestamp: string, maxAgeSeconds = 300): boolean {
  const raw = Number(timestamp);
  if (!Number.isFinite(raw)) return false;
  // Convert milliseconds (> 10^11) to seconds if needed
  const tsSeconds = raw > 1e11 ? raw / 1000 : raw;
  const ageSeconds = Math.abs(Date.now() / 1000 - tsSeconds);
  return ageSeconds <= maxAgeSeconds;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
