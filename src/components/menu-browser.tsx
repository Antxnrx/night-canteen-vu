"use client";

import { useState } from "react";
import { AddToCart } from "@/components/cart/add-to-cart";
import { SizePicker } from "@/components/cart/size-picker";
import { SkyScene } from "@/components/sky-scene";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isDaylight, type Sky } from "@/lib/sky-types";
import type { MenuCategoryWithItems, MenuItem } from "@/lib/menu";

/**
 * Per-category colour, layered OVER the sky rather than replacing it.
 *
 * The sky says what time it is and whether it's raining; these say which part
 * of the menu you're looking at. Both are true at once, so both are drawn: the
 * tints are translucent and cross-fade in over whatever the sky is doing, so a
 * rainy night stays a rainy night while Pizzas still turns the hero red.
 *
 * Indexed by category order, so adding a category on the admin menu picks up a
 * colour automatically.
 */
const CATEGORY_TINTS = [
  { wash: "rgba(23, 138, 148, 0.52)", glow: "rgba(120, 235, 235, 0.55)" }, // teal
  { wash: "rgba(178, 72, 36, 0.52)", glow: "rgba(255, 178, 104, 0.55)" }, // ember
  { wash: "rgba(46, 112, 62, 0.50)", glow: "rgba(160, 231, 150, 0.50)" }, // herb
  { wash: "rgba(150, 96, 30, 0.52)", glow: "rgba(255, 208, 130, 0.55)" }, // amber
  { wash: "rgba(150, 40, 48, 0.54)", glow: "rgba(255, 150, 130, 0.55)" }, // tomato
  { wash: "rgba(158, 122, 24, 0.50)", glow: "rgba(255, 226, 128, 0.55)" }, // yolk
  { wash: "rgba(139, 84, 22, 0.52)", glow: "rgba(255, 197, 110, 0.55)" }, // fries
] as const;

/** The kitchen is open 11:00 → midnight, so the greeting has to work all day. */
const HEADLINES: Record<Sky["phase"], string> = {
  morning: "Open, and the kettle's on.",
  afternoon: "Hot food, all afternoon.",
  golden: "Evening orders are open.",
  night: "Fresh after dark.",
};

/**
 * Customer menu in a rounded sheet that scrolls over the sky outside.
 * The backdrop follows the time of day in Kolkata and the weather over campus
 * (see `lib/sky.ts`) rather than the selected category — opening the app at 3pm
 * in the rain should look nothing like opening it at midnight.
 */
export function MenuBrowser({
  categories,
  sky,
}: {
  categories: MenuCategoryWithItems[];
  sky: Sky;
}) {
  const [selected, setSelected] = useState<string>("all");
  const selectedCategory = categories.find((category) => category.id === selected);
  const shown =
    selected === "all"
      ? categories
      : categories.filter((c) => c.id === selected);
  const daylight = isDaylight(sky.phase);

  const categoryIndex = categories.findIndex((c) => c.id === selected);
  const tint =
    categoryIndex >= 0
      ? CATEGORY_TINTS[categoryIndex % CATEGORY_TINTS.length]
      : null;

  return (
    <div className="relative min-h-full">
      <header
        className="sticky top-0 h-[min(62svh,31rem)] min-h-[23rem] overflow-hidden text-on-primary transition-[background] duration-700"
        style={{ background: sky.background }}
      >
        <SkyScene condition={sky.condition} stars={sky.stars} />

        {/* Category wash over the sky. Keyed so each pick cross-fades in. */}
        {tint && (
          <div
            key={`wash-${selected}`}
            aria-hidden
            className="absolute inset-0 animate-[nc-fade-in_0.7s_var(--ease-out-quart)_both]"
            style={{
              background: `linear-gradient(150deg, transparent 0%, ${tint.wash} 115%)`,
            }}
          />
        )}

        {/* Sun / moon glow — always present. */}
        <div
          aria-hidden
          className="absolute -right-24 top-8 size-80 rounded-full blur-3xl transition-opacity duration-500"
          style={{ background: sky.glow }}
        />

        {/* Category glow, layered on top of the sky's own. */}
        {tint && (
          <div
            key={`glow-${selected}`}
            aria-hidden
            className="absolute -left-16 top-24 size-72 rounded-full blur-3xl animate-[nc-fade-in_0.9s_var(--ease-out-quart)_both]"
            style={{
              background: `radial-gradient(circle, ${tint.glow} 0%, transparent 68%)`,
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute -bottom-28 -left-20 size-72 rounded-full border border-white/10 bg-white/5"
        />
        <div
          aria-hidden
          className="absolute bottom-12 right-8 h-44 w-44 rotate-12 rounded-[2.5rem] border border-white/10 bg-white/[0.06]"
        />

        <div className="relative mx-auto flex h-full max-w-lg flex-col px-6 pb-36 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            {/* Sun by day, the brand moon after dark — tinted to match the sky. */}
            <span className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 shadow-sm backdrop-blur-sm">
              {daylight ? (
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke={sky.orb}
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="4.2" fill={sky.orb} stroke="none" />
                  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill={sky.orb}
                  aria-hidden
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </span>
            <span
              title="crafted by Megh Vyas"
              className="font-display text-xl font-semibold tracking-tight"
            >
              Night Canteen
            </span>
          </div>

          <div className="mt-auto max-w-sm">
            {/* The sky's own words — "Rainy afternoon", not a clock reading. */}
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-primary/65">
              {selected === "all" ? sky.label : "Now viewing"}
            </p>
            <h1
              key={selected}
              className="mt-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight animate-enter"
            >
              {selectedCategory?.name ?? HEADLINES[sky.phase]}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-on-primary/75">
              {selectedCategory
                ? `A closer look at our ${selectedCategory.name.toLowerCase()}.`
                : "Order from your phone, skip the queue."}
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 -mt-24 min-h-[60svh] rounded-t-[2rem] bg-background pb-28 shadow-[0_-10px_32px_rgba(8,13,31,0.13)]">
        <div className="sticky top-0 z-20 rounded-t-[2rem] bg-background/95 px-6 pb-3 pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-lg">
            <div aria-hidden className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-foreground">
                {selectedCategory?.name ?? "Browse the menu"}
              </p>
              <span className="text-xs text-muted">
                {shown.reduce((count, category) => count + category.items.length, 0)} items
              </span>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <Pill active={selected === "all"} onClick={() => setSelected("all")}>
                All
              </Pill>
              {categories.map((category) => (
                <Pill
                  key={category.id}
                  active={selected === category.id}
                  onClick={() => setSelected(category.id)}
                >
                  {category.name}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-lg space-y-10 px-6 pt-5">
          {shown.map((category, index) => (
            <section
              key={category.id}
              className="animate-enter"
              style={{ animationDelay: `${Math.min(index, 6) * 55}ms` }}
            >
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="font-display text-xl font-medium tracking-tight text-foreground">
                  {category.name}
                </h2>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="divide-y divide-border">
                {category.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mx-auto mt-12 max-w-lg px-6 text-center text-xs text-muted">
          Pay by UPI or cash · called by number when it&apos;s ready
        </p>
      </main>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-quart)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary text-on-primary"
          : "border border-border bg-surface text-muted shadow-sm hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ItemRow({ item }: { item: MenuItem }) {
  const soldOut = !item.is_available;
  const hasVariants = item.variants.length > 0;
  const availablePrices = item.variants
    .filter((v) => v.is_available)
    .map((v) => v.price_paise);
  const fromPrice = availablePrices.length
    ? Math.min(...availablePrices)
    : item.variants.length
      ? Math.min(...item.variants.map((v) => v.price_paise))
      : item.price_paise;

  return (
    <div className="flex items-start justify-between gap-5 py-4">
      <div className={cn("min-w-0 pt-0.5", soldOut && "opacity-55")}>
        <h3 className="text-[15px] font-medium leading-snug text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="mt-1 text-sm leading-snug text-muted">
            {item.description}
          </p>
        )}
        <p className="mt-1.5 text-sm font-medium tabular-nums text-foreground">
          {hasVariants && <span className="text-muted">from </span>}
          {formatPaise(hasVariants ? fromPrice : item.price_paise)}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        {hasVariants ? (
          <SizePicker item={item} />
        ) : (
          <AddToCart
            id={item.id}
            name={item.name}
            pricePaise={item.price_paise}
            available={item.is_available}
          />
        )}
      </div>
    </div>
  );
}
