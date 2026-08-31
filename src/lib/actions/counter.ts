"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/mongodb/client";
import { logAudit } from "@/lib/audit";
import { assignOrderNumber } from "@/lib/payments";
import { priceLines, type RawLine } from "@/lib/pricing";

export type StaffOrderInput = {
  items: RawLine[];
  name: string;
  phone?: string;
  paymentMethod: "upi" | "cash";
};

export type StaffOrderResult =
  | { error: string }
  | { orderId: string; orderNumber: number | null };

/**
 * Creates a counter (staff-billed) order for a walk-up customer. Staff attest
 * the payment (cash taken, or UPI received), so it's created already PAID and
 * drops straight onto the board with a number. Same server-side pricing as QR.
 */
export async function createStaffOrder(
  input: StaffOrderInput,
): Promise<StaffOrderResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };

  const name = (input.name ?? "").trim();
  if (!name) return { error: "Enter the customer's name." };
  if (name.length > 60) return { error: "That name is too long." };

  const phone = (input.phone ?? "").trim() || null;
  if (phone && !/^[0-9+\-\s]{6,15}$/.test(phone)) {
    return { error: "Enter a valid phone number, or leave it blank." };
  }
  const method: "upi" | "cash" = input.paymentMethod === "cash" ? "cash" : "upi";

  // Service role for writes + the number counter (bypasses RLS; admin verified above).
  const supabase = createAdminClient();

  const priced = await priceLines(supabase, input.items);
  if (!priced.ok) return { error: priced.error };
  const total = priced.subtotalPaise;

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      session_id: null,
      customer_name: name,
      customer_phone: phone,
      status: "new",
      payment_status: "paid",
      payment_method: method,
      source: "counter",
      subtotal_paise: total,
      total_paise: total,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    return { error: "Couldn't create the bill. Please try again." };
  }

  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(priced.orderItems.map((oi) => ({ ...oi, order_id: order.id })));
  if (itemsErr) {
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: "Couldn't create the bill. Please try again." };
  }

  // Number last: a failed insert above would otherwise burn a number and leave
  // a gap in the night's sequence.
  const orderNumber = await assignOrderNumber(supabase, order.id);

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "order.counter_create",
    entityType: "order",
    entityId: order.id,
    summary: `Counter bill ${orderNumber ? `#${orderNumber}` : ""} · ${method} · ₹${(total / 100).toFixed(0)}`,
  });

  revalidatePath("/admin/orders");
  return { orderId: order.id, orderNumber };
}
