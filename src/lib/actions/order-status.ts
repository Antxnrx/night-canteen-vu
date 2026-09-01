"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { ALLOWED_TRANSITIONS, type OrderStatus } from "@/lib/order-status";

/**
 * Advances (or cancels) an order's status. Admin-only (RLS enforces is_admin).
 * Validates the transition and uses a conditional update so two staff acting at
 * once can't double-apply. Audit-logged.
 */
export async function setOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const { data: order } = await admin.supabase
    .from("orders")
    .select("id,status,daily_order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };

  const from = order.status as OrderStatus;
  if (!ALLOWED_TRANSITIONS[from]?.includes(toStatus)) {
    return { ok: false, error: "That status change isn't allowed." };
  }

  // Stamp when it became ready — that clock is what retires the card off the
  // board ten minutes later, so the cook never taps "collected".
  const patch: { status: OrderStatus; ready_at?: string } = { status: toStatus };
  if (toStatus === "ready") patch.ready_at = new Date().toISOString();

  const { data: updated, error } = await admin.supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("status", from) // conditional: only if still in the expected state
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    return { ok: false, error: "Couldn't update the order. Please try again." };
  }

  const label = order.daily_order_number
    ? `#${order.daily_order_number}`
    : orderId.slice(0, 8);
  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: `order.${toStatus}`,
    entityType: "order",
    entityId: orderId,
    summary: `Order ${label}: ${from} → ${toStatus}`,
    before: { status: from },
    after: { status: toStatus },
  });

  revalidatePath("/admin/orders");
  return { ok: true };
}
