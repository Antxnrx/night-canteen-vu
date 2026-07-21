"use client";

import { useState } from "react";
import { AddToCart } from "@/components/cart/add-to-cart";
import { SizePicker } from "@/components/cart/size-picker";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { MenuCategoryWithItems, MenuItem } from "@/lib/menu";

const HERO_PALETTES = [
  {
    background:
      "linear-gradient(142deg, #080d1f 0%, #18294a 42%, #b96d35 145%)",
    glow: "radial-gradient(circle, rgba(255, 192, 112, 0.9) 0%, rgba(242, 155, 70, 0.28) 38%, transparent 70%)",
  },
  {
    background:
      "linear-gradient(140deg, #170d28 0%, #45205d 47%, #e18c47 150%)",
    glow: "radial-gradient(circle, rgba(255, 210, 132, 0.88) 0%, rgba(233, 133, 81, 0.28) 38%, transparent 70%)",
  },
  {
    background:
      "linear-gradient(140deg, #062126 0%, #0f5960 48%, #e5a34b 145%)",
    glow: "radial-gradient(circle, rgba(255, 221, 134, 0.88) 0%, rgba(247, 168, 67, 0.24) 38%, transparent 70%)",
  },
  {
    background:
      "linear-gradient(140deg, #211109 0%, #6c3020 48%, #e6ae59 150%)",
    glow: "radial-gradient(circle, rgba(255, 230, 155, 0.86) 0%, rgba(250, 165, 65, 0.25) 38%, transparent 70%)",
  },
] as const;

/** Customer menu in a rounded sheet that scrolls over a category-aware backdrop. */
export function MenuBrowser({
  categories,
}: {
  categories: MenuCategoryWithItems[];
}) {
  const [selected, setSelected] = useState<string>("all");
  const selectedCategory = categories.find((category) => category.id === selected);
  const shown =
    selected === "all"
      ? categories
      : categories.filter((c) => c.id === selected);
  const paletteIndex =
    selected === "all"
      ? 0
      : Math.max(
          1,
          (categories.findIndex((category) => category.id === selected) + 1) %
            HERO_PALETTES.length,
        );
  const palette = HERO_PALETTES[paletteIndex];

  return (
    <div className="relative min-h-full">
      <header
        className="sticky top-0 h-[min(62svh,31rem)] min-h-[23rem] overflow-hidden text-on-primary"
        style={{ background: palette.background }}
      >
        <div
          aria-hidden
          className="absolute -right-24 top-8 size-80 rounded-full blur-3xl transition-opacity duration-500"
          style={{ background: palette.glow }}
        />
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
            <span className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 shadow-sm backdrop-blur-sm">
              <svg
                viewBox="0 0 24 24"
                className="size-5 text-accent"
                fill="currentColor"
                aria-hidden
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            </span>
            <span
              title="crafted by Megh Vyas"
              className="font-display text-xl font-semibold tracking-tight"
            >
              Night Canteen
            </span>
          </div>

          <div className="mt-auto max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-primary/65">
              {selected === "all" ? "Tonight's menu" : "Now viewing"}
            </p>
            <h1
              key={selected}
              className="mt-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight animate-enter"
            >
              {selectedCategory?.name ?? "Fresh after dark."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-on-primary/75">
              {selectedCategory
                ? `A closer look at our ${selectedCategory.name.toLowerCase()}.`
                : "Late-night bites and pours, ready when you are."}
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
