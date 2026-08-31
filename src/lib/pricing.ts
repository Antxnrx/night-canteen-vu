import "server-only";
import type { createAdminClient } from "@/lib/mongodb/client";

const MAX_QTY_PER_ITEM = 50;

export type RawLine = { id: string; variantId?: string | null; qty: number };

export type PricedItem = {
  menu_item_id: string;
  variant_id: string | null;
  name_snapshot: string;
  unit_price_paise_snapshot: number;
  quantity: number;
  line_total_paise: number;
};

export type PriceResult =
  | { ok: true; orderItems: PricedItem[]; subtotalPaise: number }
  | { ok: false; error: string };

/**
 * Server-side pricing for an order — the single source of truth for both
 * customer (QR) and staff (counter) orders. Recomputes every line from the DB
 * (item or chosen variant), rejects a variant item ordered without a size, and
 * refuses unavailable items. Callers pass only ids + quantities.
 */
export async function priceLines(
  supabase: ReturnType<typeof createAdminClient>,
  rawItems: RawLine[],
): Promise<PriceResult> {
  const wanted = new Map<
    string,
    { itemId: string; variantId: string | null; qty: number }
  >();
  for (const it of Array.isArray(rawItems) ? rawItems : []) {
    if (typeof it?.id !== "string") continue;
    const variantId = typeof it.variantId === "string" ? it.variantId : null;
    const q = Math.floor(Number(it.qty));
    if (!Number.isFinite(q) || q < 1) continue;
    if (q > MAX_QTY_PER_ITEM) {
      return { ok: false, error: "Please keep the quantity of any one item reasonable." };
    }
    const key = `${it.id}::${variantId ?? ""}`;
    const prev = wanted.get(key);
    wanted.set(key, {
      itemId: it.id,
      variantId,
      qty: Math.min((prev?.qty ?? 0) + q, MAX_QTY_PER_ITEM),
    });
  }
  const lines = [...wanted.values()];
  if (lines.length === 0) return { ok: false, error: "No items selected." };

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const [{ data: dbItems, error: itemsErr }, { data: dbVariants }] =
    await Promise.all([
      supabase.from("menu_items").select("id,name,price_paise,is_available").in("id", itemIds),
      supabase
        .from("menu_item_variants")
        .select("id,item_id,name,price_paise,is_available")
        .in("item_id", itemIds),
    ]);
  if (itemsErr) return { ok: false, error: "Something went wrong. Please try again." };

  const itemById = new Map((dbItems ?? []).map((i) => [i.id, i]));
  const variantById = new Map((dbVariants ?? []).map((v) => [v.id, v]));
  const hasVariants = new Set((dbVariants ?? []).map((v) => v.item_id));

  const unavailable: string[] = [];
  let subtotal = 0;
  const orderItems: PricedItem[] = [];

  for (const line of lines) {
    const item = itemById.get(line.itemId);
    if (!item || !item.is_available) {
      unavailable.push(item?.name ?? "an item");
      continue;
    }

    let unitPrice: number;
    let nameSnapshot: string;
    let variantId: string | null = null;

    if (line.variantId) {
      const v = variantById.get(line.variantId);
      if (!v || v.item_id !== line.itemId || !v.is_available) {
        unavailable.push(item.name);
        continue;
      }
      unitPrice = v.price_paise;
      nameSnapshot = `${item.name} — ${v.name}`;
      variantId = v.id;
    } else if (hasVariants.has(line.itemId)) {
      unavailable.push(item.name);
      continue;
    } else {
      unitPrice = item.price_paise;
      nameSnapshot = item.name;
    }

    const lineTotal = unitPrice * line.qty;
    subtotal += lineTotal;
    orderItems.push({
      menu_item_id: line.itemId,
      variant_id: variantId,
      name_snapshot: nameSnapshot,
      unit_price_paise_snapshot: unitPrice,
      quantity: line.qty,
      line_total_paise: lineTotal,
    });
  }

  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `No longer available: ${[...new Set(unavailable)].join(", ")}. Please update the order.`,
    };
  }

  return { ok: true, orderItems, subtotalPaise: subtotal };
}
