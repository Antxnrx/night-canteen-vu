import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/mongodb/client";
import { formatPaise } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReorderButton, type ReorderLine } from "@/components/cart/reorder-button";
import { CookingAnimation } from "@/components/cooking-animation";
import { customerStatus, isCooking, type OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session) notFound();

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id,session_id,customer_name,status,payment_status,payment_method,total_paise,daily_order_number,created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!order || order.session_id !== session.id) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "menu_item_id,variant_id,name_snapshot,unit_price_paise_snapshot,quantity,line_total_paise",
    )
    .eq("order_id", id)
    .order("name_snapshot");

  const status = (order.status as OrderStatus) ?? "pending_payment";
  const method = order.payment_method as "upi" | "cash" | null;
  const cs = customerStatus(status, method);
  const pending = status === "pending_payment";
  const done = status === "completed" || status === "cancelled";
  const ready = status === "ready";
  const cooking = isCooking(status);
  const paid = order.payment_status === "paid";
  const payLabel = paid
    ? method === "cash"
      ? "Paid · Cash"
      : "Paid · UPI"
    : method === "cash"
      ? "Cash at counter"
      : "Payment pending";

  return (
    <div className="flex min-h-full flex-col">
      <AutoRefresh intervalMs={5000} stop={done} />

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

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-28 pt-7">
        {/* Order number + status */}
        <div
          className={cn(
            "animate-enter rounded-2xl border bg-surface p-6 text-center shadow-card",
            ready ? "border-success/50 ring-1 ring-success/20" : "border-border",
          )}
        >
          <p className="text-sm text-muted">
            {order.daily_order_number ? "Your order number" : `Thanks, ${order.customer_name}`}
          </p>
          {order.daily_order_number ? (
            <p className="mt-1 font-display text-5xl font-semibold tabular-nums text-foreground">
              #{order.daily_order_number}
            </p>
          ) : null}
          <div className="mt-3 flex justify-center">
            <Badge key={status} tone={cs.tone} dot className="animate-enter">
              {cs.label}
            </Badge>
          </div>

          {cooking && (
            <div className="mt-5">
              <CookingAnimation />
              <p className="mx-auto mt-4 max-w-xs text-sm text-muted">
                On the pan now. This screen updates itself the moment it&rsquo;s
                ready — no need to refresh.
              </p>
            </div>
          )}

          {pending && (
            <p className="mx-auto mt-4 max-w-xs text-sm text-muted">
              {method === "cash"
                ? "Pay at the counter — we'll start the moment staff confirm your cash."
                : "Confirming your payment. This updates on its own in a moment."}
            </p>
          )}
          {status === "cancelled" && (
            <p className="mx-auto mt-4 max-w-xs text-sm text-danger">
              This order was cancelled. If you were charged, it will be refunded.
            </p>
          )}
        </div>

        {/* Receipt */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span>{order.customer_name}</span>
            <span>
              {payLabel} · {timeFmt.format(new Date(order.created_at))}
            </span>
          </div>
          <div className="space-y-2.5">
            {(items ?? []).map((it, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">
                  <span className="tabular-nums text-muted">{it.quantity}×</span>{" "}
                  {it.name_snapshot}
                </span>
                <span className="tabular-nums text-muted">
                  {formatPaise(it.line_total_paise)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-medium text-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {formatPaise(order.total_paise)}
            </span>
          </div>
        </div>

      </main>

      {/* Anchored to the bottom of the viewport — always reachable. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(8,13,31,0.1)]">
        <div className="mx-auto max-w-lg">
          <ReorderButton lines={(items ?? []) as ReorderLine[]} />
        </div>
      </div>
    </div>
  );
}
