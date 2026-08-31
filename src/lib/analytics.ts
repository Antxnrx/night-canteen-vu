import "server-only";
import { createClient } from "@/lib/mongodb/client";

export type Range = "today" | "7d" | "all";

export type Analytics = {
  range: Range;
  totalSalesPaise: number;
  orderCount: number;
  avgOrderPaise: number;
  bestSellers: { name: string; qty: number; revenuePaise: number }[];
  salesByHour: number[]; // 24 buckets, revenue paise (IST)
  salesByDay: { label: string; revenuePaise: number }[]; // last 7 days (IST)
};

type OrderRow = {
  total_paise: number;
  created_at: string;
  paid_at: string | null;
  order_items: { name_snapshot: string; quantity: number; line_total_paise: number }[];
};

/**
 * IST is a fixed +5:30 from UTC and India observes no DST, so a constant offset
 * is exact rather than an approximation.
 */
const IST_OFFSET_MS = 5.5 * 3600_000;

/** The UTC instant at which the IST day `daysAgo` days back began. */
function istDayStart(daysAgo = 0): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  ist.setUTCDate(ist.getUTCDate() - daysAgo);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** IST calendar date (YYYY-MM-DD) for an instant — the day-bucket key. */
function istDateKey(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Range boundaries in IST, not in the server's timezone.
 *
 * Vercel runs in UTC, so computing "today" from local midnight put the boundary
 * at 05:30 IST. For a canteen whose service runs past midnight that reported
 * ₹0 for the whole of the previous night's takings the next morning.
 */
function sinceFor(range: Range): string | null {
  if (range === "today") return istDayStart(0).toISOString();
  if (range === "7d") return istDayStart(6).toISOString();
  return null;
}

const IST_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  hourCycle: "h23",
});
const IST_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
});

/** On-demand sales analytics over PAID orders. Computed in-process (small scale). */
export async function getAnalytics(range: Range): Promise<Analytics> {
  const supabase = await createClient();
  const since = sinceFor(range);

  let query = supabase
    .from("orders")
    .select(
      "total_paise,created_at,paid_at,order_items(name_snapshot,quantity,line_total_paise)",
    )
    .eq("payment_status", "paid");
  if (since) query = query.gte("created_at", since);

  const { data } = await query;
  const orders = (data ?? []) as unknown as OrderRow[];

  const totalSalesPaise = orders.reduce((s, o) => s + (o.total_paise ?? 0), 0);
  const orderCount = orders.length;
  const avgOrderPaise = orderCount ? Math.round(totalSalesPaise / orderCount) : 0;

  const itemMap = new Map<string, { qty: number; revenuePaise: number }>();
  const salesByHour = new Array(24).fill(0) as number[];

  // last 7 IST days, oldest → newest. Key and label both come from IST, so a
  // sale at 00:30 IST lands under the day the staff would call it.
  const dayBuckets = new Map<string, { label: string; revenuePaise: number }>();
  for (let i = 6; i >= 0; i--) {
    const dayStart = istDayStart(i);
    dayBuckets.set(istDateKey(dayStart), {
      label: IST_DAY.format(dayStart),
      revenuePaise: 0,
    });
  }

  for (const o of orders) {
    const when = new Date(o.paid_at ?? o.created_at);
    salesByHour[Number(IST_HOUR.format(when))] += o.total_paise ?? 0;

    const bucket = dayBuckets.get(istDateKey(when));
    if (bucket) bucket.revenuePaise += o.total_paise ?? 0;

    for (const it of o.order_items ?? []) {
      const cur = itemMap.get(it.name_snapshot) ?? { qty: 0, revenuePaise: 0 };
      cur.qty += it.quantity;
      cur.revenuePaise += it.line_total_paise;
      itemMap.set(it.name_snapshot, cur);
    }
  }

  const bestSellers = [...itemMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  return {
    range,
    totalSalesPaise,
    orderCount,
    avgOrderPaise,
    bestSellers,
    salesByHour,
    salesByDay: [...dayBuckets.values()],
  };
}
