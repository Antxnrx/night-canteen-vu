import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";
import { AvailabilityToggle } from "@/components/admin/availability-toggle";
import { DeleteItemButton } from "@/components/admin/delete-item-button";
import { AddCategoryForm } from "@/components/admin/add-category-form";
import { CategoryHeader } from "@/components/admin/category-header";
import { MoveButtons } from "@/components/admin/move-buttons";

export const dynamic = "force-dynamic";

type Item = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_paise: number;
  is_available: boolean;
  sort_order: number;
};
type Cat = { id: string; name: string; sort_order: number };

export default async function AdminMenuPage() {
  const supabase = await createClient();
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("menu_categories").select("id,name,sort_order").order("sort_order"),
    supabase
      .from("menu_items")
      .select("id,category_id,name,description,price_paise,is_available,sort_order")
      .order("sort_order"),
  ]);

  const cats = (categories ?? []) as Cat[];
  const allItems = (items ?? []) as Item[];
  const byCat = (cid: string | null) => allItems.filter((i) => i.category_id === cid);
  const uncategorized = byCat(null);
  const total = allItems.length;
  const isEmpty = cats.length === 0 && uncategorized.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Menu</h1>
          <p className="mt-0.5 text-sm text-muted">
            {total} item{total === 1 ? "" : "s"} · reorder with the arrows
          </p>
        </div>
        <Link href="/admin/menu/new" className={buttonClasses({ size: "md" })}>
          + Add item
        </Link>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-base font-medium text-foreground">No menu yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
            Add your first category below, then start adding items.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {cats.map((cat, i) => (
            <section key={cat.id}>
              <CategoryHeader
                id={cat.id}
                name={cat.name}
                count={byCat(cat.id).length}
                isFirst={i === 0}
                isLast={i === cats.length - 1}
              />
              <ItemList items={byCat(cat.id)} />
            </section>
          ))}

          {uncategorized.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2 px-1">
                <h2 className="text-base font-semibold text-foreground">
                  Uncategorized
                </h2>
                <span className="text-xs text-muted">{uncategorized.length}</span>
              </div>
              <ItemList items={uncategorized} />
            </section>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Add a category</p>
        <AddCategoryForm />
      </div>
    </div>
  );
}

function ItemList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-4 py-5 text-sm text-muted">
        No items in this category yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {items.map((item, i) => (
        <ItemRow
          key={item.id}
          item={item}
          isFirst={i === 0}
          isLast={i === items.length - 1}
        />
      ))}
    </div>
  );
}

function ItemRow({
  item,
  isFirst,
  isLast,
}: {
  item: Item;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-3",
        !isFirst && "border-t border-border",
      )}
    >
      <MoveButtons id={item.id} kind="item" isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[15px] font-medium text-foreground",
              !item.is_available && "text-muted line-through",
            )}
          >
            {item.name}
          </span>
          {!item.is_available && <Badge tone="danger">Sold out</Badge>}
        </div>
        <div className="text-sm tabular-nums text-muted">
          {formatPaise(item.price_paise)}
        </div>
      </div>
      <AvailabilityToggle id={item.id} available={item.is_available} />
      <Link
        href={`/admin/menu/${item.id}`}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        Edit
      </Link>
      <DeleteItemButton id={item.id} name={item.name} />
    </div>
  );
}
