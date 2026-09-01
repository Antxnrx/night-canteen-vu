"use client";

import { useState } from "react";
import Image from "next/image";
import { AddToCart } from "@/components/cart/add-to-cart";
import { SizePicker } from "@/components/cart/size-picker";
import { SkyScene } from "@/components/sky-scene";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Sky } from "@/lib/sky-types";
import type { MenuCategoryWithItems, MenuItem } from "@/lib/menu";

/** Category photo mapping with aliases and keyword support so images auto-assign cleanly. */
const CATEGORY_PHOTOS: Record<string, string> = {
  // Beverages
  beverages: "/beverages.png",
  beverage: "/beverages.png",
  drinks: "/beverages.png",
  drink: "/beverages.png",
  tea: "/beverages.png",
  coffee: "/beverages.png",
  // Maggi
  maggi: "/maggie.png",
  maggie: "/maggie.png",
  noodles: "/maggie.png",
  // Sandwiches
  sandwiches: "/sandwich.png",
  sandwich: "/sandwich.png",
  burgers: "/sandwich.png",
  burger: "/sandwich.png",
  // Breads / Rolls
  breads: "/bread.png",
  bread: "/bread.png",
  buns: "/bread.png",
  bun: "/bread.png",
  rolls: "/bread.png",
  roll: "/bread.png",
  // Pizzas
  pizzas: "/pizza.png",
  pizza: "/pizza.png",
  // Eggs
  eggs: "/egg.png",
  egg: "/egg.png",
  omelette: "/egg.png",
  omelettes: "/egg.png",
  omlette: "/egg.png",
  // Fries
  "french fries": "/fries.png",
  fries: "/fries.png",
  fry: "/fries.png",
  snacks: "/fries.png",
  snack: "/fries.png",
};

function getCategoryPhoto(name: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (CATEGORY_PHOTOS[normalized]) return CATEGORY_PHOTOS[normalized];
  // Fallback: substring matching
  for (const [key, photo] of Object.entries(CATEGORY_PHOTOS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return photo;
    }
  }
  return undefined;
}

/** Native aspect ratio of the category photos above — they're all cropped to the same size. */
const CATEGORY_PHOTO_ASPECT = { w: 1402, h: 1122 };

/** The "All" view's hero photo — same treatment as a category photo, own aspect ratio. */
const HOME_PHOTO = { src: "/home.png", w: 1402, h: 1122 };

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
  const categoryPhoto = selectedCategory
    ? getCategoryPhoto(selectedCategory.name)
    : undefined;
  const heroPhoto =
    selected === "all"
      ? HOME_PHOTO
      : categoryPhoto
        ? { src: categoryPhoto, w: CATEGORY_PHOTO_ASPECT.w, h: CATEGORY_PHOTO_ASPECT.h }
        : undefined;
  const weatherTicker = `${sky.label} · Vijaybhoomi, Karjat`;

  return (
    <div className="relative min-h-full">
      <header
        className="sticky top-0 h-[min(62svh,31rem)] min-h-[23rem] overflow-hidden text-on-primary transition-[background] duration-700"
        style={{ background: heroPhoto ? undefined : sky.background }}
      >
        {heroPhoto ? (
          <div
            key={`photo-${selected}`}
            aria-hidden
            className="absolute inset-0 animate-[nc-fade-in_0.5s_var(--ease-out-quart)_both] bg-primary-deep"
          >
            {/* Locked to the photo's own aspect ratio so it's shown in full, not cropped/zoomed by `cover`. */}
            <div
              className="absolute inset-x-0 top-0 w-full"
              style={{ aspectRatio: `${heroPhoto.w} / ${heroPhoto.h}` }}
            >
              <Image
                src={heroPhoto.src}
                alt=""
                fill
                priority
                sizes="(min-width: 32rem) 32rem, 100vw"
                className="object-cover"
              />
            </div>
            {/* Dark gradient so the header text stays legible over the photo. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
            {/* Same rain/stars as the sky view, drawn over the photo too. */}
            <SkyScene condition={sky.condition} stars={sky.stars} />
          </div>
        ) : (
          <>
            <SkyScene condition={sky.condition} stars={sky.stars} />

            {/* Sun / moon glow — always present. */}
            <div
              aria-hidden
              className="absolute -right-24 top-8 size-80 rounded-full blur-3xl transition-opacity duration-500"
              style={{ background: sky.glow }}
            />
            <div
              aria-hidden
              className="absolute -bottom-28 -left-20 size-72 rounded-full border border-white/10 bg-white/5"
            />
            <div
              aria-hidden
              className="absolute bottom-12 right-8 h-44 w-44 rotate-12 rounded-[2.5rem] border border-white/10 bg-white/[0.06]"
            />
          </>
        )}

        <div className="relative mx-auto flex h-full max-w-lg flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <div className="inline-flex w-fit shrink-0 items-center rounded-full bg-white px-4 py-1.5 shadow-sm">
              <span
                title="crafted by Megh Vyas"
                className="font-sans text-sm font-medium lowercase tracking-[0.12em] text-foreground"
              >
                night canteen
              </span>
            </div>

            {/* Live weather + place, scrolling — decorative, so hidden from assistive tech. */}
            <div aria-hidden className="min-w-0 flex-1 overflow-hidden">
              <div className="flex w-max animate-marquee">
                {[0, 1].map((copy) => (
                  <div key={copy} className="flex shrink-0 items-center">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span
                        key={i}
                        className="mr-8 shrink-0 whitespace-nowrap font-sans text-xs font-medium uppercase tracking-[0.14em] text-white"
                      >
                        {weatherTicker}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        className="relative z-10 -mt-24 min-h-[60svh] rounded-t-[2rem] bg-background pb-28 shadow-[0_-10px_32px_rgba(8,13,31,0.13)]"
        style={
          heroPhoto
            ? {
                // Same overlap logic on every photo page: rise until the sheet meets
                // the photo's own bottom edge, whatever the hero's height resolves to.
                marginTop: `calc(${(heroPhoto.h / heroPhoto.w) * 100}vw - max(23rem, min(62svh, 31rem)) - 1.75rem)`,
              }
            : undefined
        }
      >
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
          Anton was here 👀
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
