export type OrderStatus =
  | "pending_payment"
  | "new"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type StatusTone = "neutral" | "success" | "danger" | "accent" | "primary";

/**
 * How long a Ready order stays on the board before it retires itself.
 * The cook only ever taps one button; nothing has to be acknowledged as
 * collected. Kept in sync with `sweep_orders()`'s default in migration 0008.
 */
export const READY_WINDOW_MS = 10 * 60 * 1000;

/**
 * The flow is deliberately two states wide:
 *
 *   paid  →  COOKING  →  READY  →  (retires itself after 10 minutes)
 *
 * `preparing` is a retired status from an older version. Rows may still carry
 * it, so everything below treats it as an alias of `new` rather than pretending
 * it can't appear.
 */
export const STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  pending_payment: { label: "Awaiting payment", tone: "accent" },
  new: { label: "Cooking", tone: "primary" },
  preparing: { label: "Cooking", tone: "primary" },
  ready: { label: "Ready", tone: "success" },
  completed: { label: "Collected", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** Statuses that belong on the live board (paid, not yet retired). */
export const ACTIVE_STATUSES: OrderStatus[] = ["new", "preparing", "ready"];

/** True while the kitchen still has work to do on this order. */
export function isCooking(status: OrderStatus): boolean {
  return status === "new" || status === "preparing";
}

/**
 * Legal status transitions, validated server-side.
 * `completed` is reachable but is normally reached by the sweep, not by a tap.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  new: ["ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * What the customer sees. One word while they wait — no multi-step stepper,
 * no percentage, nothing that implies more precision than the kitchen has.
 */
export function customerStatus(
  status: OrderStatus,
  _method?: "upi" | null,
): { label: string; tone: StatusTone } {
  switch (status) {
    case "pending_payment":
      return { label: "Confirming payment", tone: "accent" };
    case "new":
    case "preparing":
      return { label: "Cooking", tone: "primary" };
    case "ready":
      return { label: "Ready — collect at the counter", tone: "success" };
    case "completed":
      return { label: "Collected — enjoy!", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" };
    default:
      return { label: "Order placed", tone: "neutral" };
  }
}

export type PaymentStatus = "created" | "paid" | "failed" | "refunded";

export type BoardOrder = {
  id: string;
  daily_order_number: number | null;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: "upi" | null;
  total_paise: number;
  created_at: string;
  ready_at: string | null;
  order_items: { name_snapshot: string; quantity: number }[];
};

// Board query: active paid orders.
// Ready orders past their window are retired by `sweep_orders()` before this
// query runs, so no time filter is needed here.
export const BOARD_SELECT =
  "id,daily_order_number,customer_name,customer_phone,status,payment_status,payment_method,total_paise,created_at,ready_at,order_items(name_snapshot,quantity)";
export const BOARD_FILTER = "status.in.(new,preparing,ready)";
