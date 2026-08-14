import { redirect } from "next/navigation";
import { getStoreOpen } from "@/lib/store";
import { getActiveOrder } from "@/lib/customer-order";

export const dynamic = "force-dynamic";

export default async function ClosedPage() {
  // If we've reopened, don't strand people here.
  if (await getStoreOpen()) redirect("/");

  // Closed, but this person already has food coming (or cash to hand over).
  // They should be watching their order, not reading a goodbye note.
  const active = await getActiveOrder();
  if (active) redirect(`/order/${active.id}`);

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-primary-deep px-6 py-16 text-center text-on-primary">
      <div className="max-w-md">
        <span className="relative mx-auto mb-8 grid size-14 place-items-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-accent/20 blur-lg" />
          <svg viewBox="0 0 24 24" className="relative size-9 text-accent" fill="currentColor" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        </span>

        <h1 className="text-balance font-display text-3xl font-semibold leading-tight tracking-tight">
          The tawa&rsquo;s cooling down.
        </h1>

        <p className="mx-auto mt-4 max-w-sm text-pretty text-on-primary/75">
          Night Canteen is closed right now. Maybe we&rsquo;re restocking, maybe
          we&rsquo;re just catching a breather — either way, the kitchen&rsquo;s
          off. Go finish that assignment you&rsquo;ve been avoiding, touch some
          grass, and manifest our return.
        </p>

        <p className="mt-6 text-sm text-on-primary/55">
          We&rsquo;ll be back before your next all-nighter. Try again when the
          lights are on.
        </p>
      </div>
    </main>
  );
}
