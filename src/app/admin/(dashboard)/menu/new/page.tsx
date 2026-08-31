import { createClient } from "@/lib/mongodb/client";
import { createItem } from "@/lib/actions/menu";
import { ItemForm } from "@/components/admin/item-form";
import { BackHeader } from "@/components/admin/back-header";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id,name")
    .order("sort_order");

  return (
    <div className="mx-auto max-w-lg">
      <BackHeader title="Add item" />
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <ItemForm
          action={createItem}
          categories={categories ?? []}
          submitLabel="Add item"
        />
      </div>
    </div>
  );
}
