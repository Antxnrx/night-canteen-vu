import { createClient } from "@/lib/mongodb/client";
import { BOARD_SELECT, BOARD_FILTER, type BoardOrder } from "@/lib/order-status";
import { sweepOrders } from "@/lib/sweep";
import { OrderBoard } from "@/components/admin/order-board";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  // Retire collected orders + abandoned checkouts before reading the board.
  await sweepOrders();

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(BOARD_SELECT)
    .or(BOARD_FILTER)
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">Orders</h1>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="size-2 rounded-full bg-success" />
          Live
        </span>
      </div>
      <OrderBoard initial={(data ?? []) as unknown as BoardOrder[]} />
    </div>
  );
}
