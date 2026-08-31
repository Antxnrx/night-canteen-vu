import "server-only";
import { createClient } from "@/lib/mongodb/client";
import { isMongoConfigured } from "@/lib/env";

export type MenuVariant = {
  id: string;
  name: string;
  price_paise: number;
  is_available: boolean;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_paise: number;
  is_available: boolean;
  sort_order: number;
  variants: MenuVariant[];
};

export type MenuCategoryWithItems = {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItem[];
};

export type Menu = {
  configured: boolean;
  categories: MenuCategoryWithItems[];
};

type ItemRow = Omit<MenuItem, "variants">;
type VariantRow = MenuVariant & { item_id: string };

const ITEM_COLUMNS =
  "id,category_id,name,description,price_paise,is_available,sort_order";
const VARIANT_COLUMNS = "id,item_id,name,price_paise,is_available,sort_order";

/**
 * Loads the full menu grouped by category, with size variants attached.
 * Returns `configured:false` before MongoDB is wired. Degrades gracefully if
 * the variants table doesn't exist yet (items simply have no variants).
 */
export async function getMenu(): Promise<Menu> {
  if (!isMongoConfigured()) {
    return { configured: false, categories: [] };
  }

  const supabase = await createClient();
  const [
    { data: categories, error: catErr },
    { data: items, error: itemErr },
    { data: variants },
  ] = await Promise.all([
    supabase.from("menu_categories").select("id,name,sort_order").order("sort_order"),
    supabase.from("menu_items").select(ITEM_COLUMNS).order("sort_order"),
    supabase
      .from("menu_item_variants")
      .select(VARIANT_COLUMNS)
      .order("sort_order"),
  ]);

  if (catErr || itemErr) {
    return { configured: true, categories: [] };
  }

  const variantsByItem = new Map<string, MenuVariant[]>();
  for (const v of (variants ?? []) as VariantRow[]) {
    const { item_id, ...variant } = v;
    const list = variantsByItem.get(item_id) ?? [];
    list.push(variant);
    variantsByItem.set(item_id, list);
  }

  const itemsByCategory = new Map<string | null, MenuItem[]>();
  for (const row of (items ?? []) as ItemRow[]) {
    const item: MenuItem = { ...row, variants: variantsByItem.get(row.id) ?? [] };
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  const grouped: MenuCategoryWithItems[] = (categories ?? [])
    .map((c) => ({ ...c, items: itemsByCategory.get(c.id) ?? [] }))
    .filter((c) => c.items.length > 0);

  return { configured: true, categories: grouped };
}
