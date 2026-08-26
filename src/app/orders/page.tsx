import Link from "next/link";
import { getActiveOrders } from "@/lib/customer-order";
import { formatPaise } from "@/lib/format";
import { customerStatus } from "@/lib/order-status";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * All of the customer's active orders — reached from the "Track" bar once
 * there's more than one, since that bar can only ever point at a single
 * order. Deliberately light: just enough per order to tell them apart and
 * pick one. Full detail lives on `/order/[id]`.
 */
export default async function OrdersPage() {
  const orders = await getActiveOrders();

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-primary-deep text-on-primary">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-5 py-4">
          <svg viewBox="0 0 24 24" className="size-5 text-accent" fill="currentColor" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
          <span
            title="crafted by Megh Vyas"
            className="font-display text-base font-semibold tracking-tight"
          >
            Night Canteen
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-6">
        <h1 className="mb-4 text-lg font-semibold text-foreground">Your orders</h1>
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
            <p className="text-base font-medium text-foreground">No active orders</p>
            <p className="mt-1.5 text-sm text-muted">
              Nothing on the pan right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const cs = customerStatus(order.status, order.payment_method);
              return (
                <Link
                  key={order.id}
                  href={`/order/${order.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold tabular-nums text-foreground">
                      {order.daily_order_number ?? "•"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {formatPaise(order.total_paise)}
                      </span>
                      <span className="block text-xs text-muted">
                        {timeFmt.format(new Date(order.created_at))}
                      </span>
                    </span>
                  </span>
                  <Badge tone={cs.tone} dot className="shrink-0">
                    {cs.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
