import { NextResponse } from "next/server";
import { createClient } from "@/lib/mongodb/client";
import { BOARD_SELECT, BOARD_FILTER } from "@/lib/order-status";
import { sweepOrders } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/** GET /api/admin/orders — board orders (active paid). Admin only. */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Throttled internally, so the 5s board poll doesn't turn this into a flood.
  await sweepOrders();

  const { data, error } = await supabase
    .from("orders")
    .select(BOARD_SELECT)
    .or(BOARD_FILTER)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
