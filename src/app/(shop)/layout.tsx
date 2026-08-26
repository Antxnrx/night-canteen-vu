import { redirect } from "next/navigation";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartBar } from "@/components/cart/cart-bar";
import { getStoreOpen } from "@/lib/store";
import { getActiveOrders } from "@/lib/customer-order";

/** Customer shopping surface — provides cart state + the floating cart bar. */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Closing the canteen stops NEW orders — it does not abandon the people who
  // already have one. Anyone still waiting on food (or still owing cash at the
  // counter) goes to their order, not to a wall telling them we're shut.
  if (!(await getStoreOpen())) {
    const active = await getActiveOrders();
    redirect(
      active.length > 1 ? "/orders" : active.length === 1 ? `/order/${active[0].id}` : "/closed",
    );
  }

  return (
    <CartProvider>
      {children}
      <CartBar />
    </CartProvider>
  );
}
