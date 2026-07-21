import { getMenu } from "@/lib/menu";
import { getActiveOrder } from "@/lib/customer-order";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { MenuBrowser } from "@/components/menu-browser";
import { ActiveOrderBar } from "@/components/cart/active-order-bar";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const [menu, activeOrder] = await Promise.all([getMenu(), getActiveOrder()]);
  const hasMenu = menu.categories.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      {activeOrder && <ActiveOrderBar order={activeOrder} />}
      {/* Live menu: sold-out / price / size changes appear instantly. */}
      <RealtimeRefresh table="menu_items" channel="menu" />
      <RealtimeRefresh table="menu_item_variants" channel="menu-variants" />

      {hasMenu ? (
        <MenuBrowser categories={menu.categories} />
      ) : (
        <main className="flex-1 bg-background pb-28 pt-7">
          <div className="mx-auto max-w-lg px-6 pt-7">
            <MenuEmptyState configured={menu.configured} />
          </div>
        </main>
      )}
    </div>
  );
}

function MenuEmptyState({ configured }: { configured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <p className="text-base font-medium text-foreground">
        The menu is being set up
      </p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
        {configured
          ? "No items are on the menu yet. Check back in a bit."
          : "Almost there — finish the Supabase setup in SETUP.md to load the menu."}
      </p>
    </div>
  );
}
