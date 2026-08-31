"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

// Lenient UUID *format* check (8-4-4-4-12 hex). We don't enforce RFC variant
// bits — the DB's foreign keys enforce that IDs reference real rows, and the
// seed uses memorable non-RFC UUIDs.
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type ItemFormState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
};
export type CategoryFormState = { error: string | null; ok?: boolean };

type ItemData = {
  name: string;
  description: string | null;
  price_paise: number;
  is_available: boolean;
  category_id: string | null;
};

function validateItem(
  formData: FormData,
): { data: ItemData } | { fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  if (!name) fieldErrors.name = "Name is required";
  else if (name.length > 80) fieldErrors.name = "Keep the name under 80 characters";

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 280)
    fieldErrors.description = "Keep it under 280 characters";

  const priceRaw = String(formData.get("price_rupees") ?? "").trim();
  const price = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(price))
    fieldErrors.price_rupees = "Enter a valid price";
  else if (price < 0) fieldErrors.price_rupees = "Price can't be negative";
  else if (price > 100000) fieldErrors.price_rupees = "That price looks too high";

  const is_available = formData.get("is_available") === "on";
  const rawCat = formData.get("category_id");
  const category_id =
    typeof rawCat === "string" && UUID_RE.test(rawCat) ? rawCat : null;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      name,
      description: description || null,
      price_paise: Math.round(price * 100),
      is_available,
      category_id,
    },
  };
}

/** Parses the item form's size variants (JSON of {name, price} in rupees). */
function parseVariants(
  formData: FormData,
): { name: string; price_paise: number }[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("variants") ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: { name: string; price_paise: number }[] = [];
  for (const r of raw) {
    const name = String((r as { name?: unknown })?.name ?? "").trim();
    const price = Number((r as { price?: unknown })?.price);
    if (!name || !Number.isFinite(price) || price < 0) continue;
    out.push({ name: name.slice(0, 40), price_paise: Math.round(price * 100) });
  }
  return out;
}

/** Replaces an item's variants (best-effort; won't fail item CRUD). */
async function syncVariants(
  supabase: NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>>["supabase"],
  itemId: string,
  variants: { name: string; price_paise: number }[],
) {
  await supabase.from("menu_item_variants").delete().eq("item_id", itemId);
  if (variants.length > 0) {
    await supabase.from("menu_item_variants").insert(
      variants.map((v, i) => ({
        item_id: itemId,
        name: v.name,
        price_paise: v.price_paise,
        sort_order: i,
      })),
    );
  }
}

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/");
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };

  const result = validateItem(formData);
  if ("fieldErrors" in result)
    return { error: "Please fix the highlighted fields.", fieldErrors: result.fieldErrors };

  // Place new items at the end of their category.
  let maxQuery = admin.supabase
    .from("menu_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  maxQuery = result.data.category_id
    ? maxQuery.eq("category_id", result.data.category_id)
    : maxQuery.is("category_id", null);
  const { data: maxRow } = await maxQuery.maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await admin.supabase
    .from("menu_items")
    .insert({ ...result.data, sort_order })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save the item. Please try again." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_item.create",
    entityType: "menu_item",
    entityId: data.id,
    summary: `Added "${result.data.name}"`,
    after: result.data,
  });

  await syncVariants(admin.supabase, data.id, parseVariants(formData));

  revalidateMenu();
  redirect("/admin/menu");
}

export async function updateItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { error: "Missing item reference." };

  const result = validateItem(formData);
  if ("fieldErrors" in result)
    return { error: "Please fix the highlighted fields.", fieldErrors: result.fieldErrors };

  const { data: before } = await admin.supabase
    .from("menu_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.supabase
    .from("menu_items")
    .update(result.data)
    .eq("id", id);
  if (error) return { error: "Couldn't save changes. Please try again." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_item.update",
    entityType: "menu_item",
    entityId: id,
    summary: `Updated "${result.data.name}"`,
    before,
    after: result.data,
  });

  await syncVariants(admin.supabase, id, parseVariants(formData));

  revalidateMenu();
  redirect("/admin/menu");
}

export async function deleteItem(id: string): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { error: "Invalid item reference." };

  const { data: before } = await admin.supabase
    .from("menu_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.supabase.from("menu_items").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the item. Please try again." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_item.delete",
    entityType: "menu_item",
    entityId: id,
    summary: before ? `Removed "${before.name}"` : "Removed an item",
    before,
  });

  revalidateMenu();
  return { error: null };
}

export async function setItemAvailability(
  id: string,
  available: boolean,
): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { error: "Invalid item reference." };

  const { error } = await admin.supabase
    .from("menu_items")
    .update({ is_available: available })
    .eq("id", id);
  if (error) return { error: "Couldn't update availability." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_item.availability",
    entityType: "menu_item",
    entityId: id,
    summary: available ? "Marked available" : "Marked sold out",
  });

  revalidateMenu();
  return { error: null };
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Your session expired. Please sign in again." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a category name." };
  if (name.length > 60) return { error: "Keep it under 60 characters." };

  const { data: maxRow } = await admin.supabase
    .from("menu_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await admin.supabase
    .from("menu_categories")
    .insert({ name, sort_order })
    .select("id")
    .single();
  if (error) return { error: "Couldn't add the category." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_category.create",
    entityType: "menu_category",
    entityId: data.id,
    summary: `Added category "${name}"`,
  });

  revalidateMenu();
  return { error: null, ok: true };
}

type MoveResult = { ok: boolean; error?: string };

/** Swaps an item's sort_order with its neighbour within the same category. */
export async function moveItem(
  id: string,
  direction: "up" | "down",
): Promise<MoveResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid item reference." };

  const { data: item } = await admin.supabase
    .from("menu_items")
    .select("id,category_id,sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };

  let q = admin.supabase.from("menu_items").select("id,sort_order").limit(1);
  q = item.category_id
    ? q.eq("category_id", item.category_id)
    : q.is("category_id", null);
  q =
    direction === "up"
      ? q.lt("sort_order", item.sort_order).order("sort_order", { ascending: false })
      : q.gt("sort_order", item.sort_order).order("sort_order", { ascending: true });

  const { data: neighbor } = await q.maybeSingle();
  if (!neighbor) return { ok: true }; // already at the edge

  await admin.supabase
    .from("menu_items")
    .update({ sort_order: item.sort_order })
    .eq("id", neighbor.id);
  await admin.supabase
    .from("menu_items")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", id);

  revalidateMenu();
  return { ok: true };
}

/** Swaps a category's sort_order with its neighbour. */
export async function moveCategory(
  id: string,
  direction: "up" | "down",
): Promise<MoveResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid category reference." };

  const { data: cat } = await admin.supabase
    .from("menu_categories")
    .select("id,sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!cat) return { ok: false, error: "Category not found." };

  const q = admin.supabase.from("menu_categories").select("id,sort_order").limit(1);
  const { data: neighbor } =
    direction === "up"
      ? await q.lt("sort_order", cat.sort_order).order("sort_order", { ascending: false }).maybeSingle()
      : await q.gt("sort_order", cat.sort_order).order("sort_order", { ascending: true }).maybeSingle();
  if (!neighbor) return { ok: true };

  await admin.supabase
    .from("menu_categories")
    .update({ sort_order: cat.sort_order })
    .eq("id", neighbor.id);
  await admin.supabase
    .from("menu_categories")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", id);

  revalidateMenu();
  return { ok: true };
}

/** Renames a category. */
export async function renameCategory(
  id: string,
  name: string,
): Promise<MoveResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid category reference." };

  const trimmed = (name ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a category name." };
  if (trimmed.length > 60) return { ok: false, error: "Keep it under 60 characters." };

  const { error } = await admin.supabase
    .from("menu_categories")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't rename the category." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_category.rename",
    entityType: "menu_category",
    entityId: id,
    summary: `Renamed a category to "${trimmed}"`,
  });

  revalidateMenu();
  return { ok: true };
}

/** Deletes a category — blocked if it still holds items (so none are orphaned). */
export async function deleteCategory(id: string): Promise<MoveResult> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid category reference." };

  const { count } = await admin.supabase
    .from("menu_items")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "This category still has items. Move or remove them first.",
    };
  }

  const { data: before } = await admin.supabase
    .from("menu_categories")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.supabase
    .from("menu_categories")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the category." };

  await logAudit(admin.supabase, {
    actorId: admin.user.id,
    action: "menu_category.delete",
    entityType: "menu_category",
    entityId: id,
    summary: before ? `Deleted category "${before.name}"` : "Deleted a category",
  });

  revalidateMenu();
  return { ok: true };
}
