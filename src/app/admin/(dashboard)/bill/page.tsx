import { getMenu } from "@/lib/menu";
import { CounterBill } from "@/components/admin/counter-bill";

export const dynamic = "force-dynamic";

export default async function BillPage() {
  const menu = await getMenu();
  const hasMenu = menu.categories.length > 0;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">New bill</h1>
        <p className="mt-0.5 text-sm text-muted">
          Tap items, then collect payment via UPI — the order hits the board with a number.
        </p>
      </div>

      {hasMenu ? (
        <CounterBill menu={menu.categories} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-base font-medium text-foreground">No menu items</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
            Add items in the Menu tab first.
          </p>
        </div>
      )}
    </div>
  );
}
