import { notFound } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import { updateItem } from "@/lib/actions/menu";
import { ItemForm } from "@/components/admin/item-form";
import { BackHeader } from "@/components/admin/back-header";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: categories }, { data: variants }] =
    await Promise.all([
      supabase
        .from("menu_items")
        .select("id,name,description,price_paise,is_available,category_id")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("menu_categories").select("id,name").order("sort_order"),
      supabase
        .from("menu_item_variants")
        .select("name,price_paise,sort_order")
        .eq("item_id", id)
        .order("sort_order"),
    ]);

  if (!item) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <BackHeader title="Edit item" />
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <ItemForm
          action={updateItem}
          categories={categories ?? []}
          values={{ ...item, variants: variants ?? [] }}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
