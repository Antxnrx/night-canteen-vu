import "server-only";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";
import type { OrderStatus } from "@/lib/order-status";

export type ActiveOrder = {
  id: string;
  daily_order_number: number | null;
  status: OrderStatus;
  payment_method: "upi" | "cash" | null;
  total_paise: number;
  created_at: string;
};

/**
 * All of the current customer's *active* orders (paid & not yet collected, or
 * a cash order awaiting payment), newest first. Abandoned UPI checkouts are
 * excluded. Used to surface a "track your order(s)" entry point so a customer
 * never loses an order — including one placed before another that's still
 * active, which a single-order lookup would otherwise hide.
 */
export async function getActiveOrders(): Promise<ActiveOrder[]> {
  if (!isMongoConfigured()) return [];
  const session = await getSession();
  if (!session) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("id,daily_order_number,status,payment_method,total_paise,created_at")
    .eq("session_id", session.id)
    .or("status.in.(new,ready),and(status.eq.pending_payment,payment_method.eq.cash)")
    .order("created_at", { ascending: false });

  return (data as ActiveOrder[]) ?? [];
}
