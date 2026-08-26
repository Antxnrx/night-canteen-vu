"use client";

import { useState } from "react";
import { useCart, lineKey } from "@/components/cart/cart-provider";
import { formatPaise } from "@/lib/format";
import type { MenuItem, MenuVariant } from "@/lib/menu";

/** Trigger for a variant item: opens a bottom sheet to pick a size. */
export function SizePicker({ item }: { item: MenuItem }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const { qtyOfItem } = useCart();
  const totalQty = qtyOfItem(item.id);
  const available = item.variants.filter((v) => v.is_available);

  function close() {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 220);
  }

  if (!item.is_available || available.length === 0) {
    return <span className="text-xs font-medium text-danger">Sold out</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Choose a size for ${item.name}`}
        className="relative grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent-hover active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <PlusIcon />
        {totalQty > 0 && (
          <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
            {totalQty}
          </span>
        )}
      </button>
      {open && (
        <SizeSheet
          item={item}
          variants={available}
          closing={closing}
          onClose={close}
        />
      )}
    </>
  );
}

function SizeSheet({
  item,
  variants,
  closing,
  onClose,
}: {
  item: MenuItem;
  variants: MenuVariant[];
  closing: boolean;
  onClose: () => void;
}) {
  const { qtyOf, add, setQty } = useCart();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Choose a size for ${item.name}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-primary-deep/50"
        style={{
          animation: closing
            ? "nc-fade-in 0.2s ease 0s 1 reverse forwards"
            : "nc-fade-in 0.2s ease both",
        }}
      />
      <div
        style={{
          animation: closing
            ? "nc-sheet-out 0.22s var(--ease-out-quart) both"
            : "nc-slide-up 0.32s var(--ease-out-expo) both",
        }}
        className="relative w-full max-w-lg rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h3 className="text-lg font-semibold text-foreground">{item.name}</h3>
        {item.description && (
          <p className="mt-0.5 text-sm text-muted">{item.description}</p>
        )}

        <div className="mt-4 space-y-2">
          {variants.map((v) => {
            const q = qtyOf(item.id, v.id);
            const displayName = `${item.name} — ${v.name}`;
            return (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="text-[15px] font-medium text-foreground">
                    {v.name}
                  </p>
                  <p className="text-sm tabular-nums text-muted">
                    {formatPaise(v.price_paise)}
                  </p>
                </div>
                {q === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      add({ id: item.id, variantId: v.id, name: displayName, price_paise: v.price_paise })
                    }
                    className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-[transform,background-color] duration-150 hover:bg-accent-hover active:scale-95"
                  >
                    Add
                  </button>
                ) : (
                  <div className="flex items-center gap-1 rounded-full bg-accent/12 p-0.5">
                    <StepBtn
                      label={`Remove one ${v.name}`}
                      onClick={() => setQty(lineKey(item.id, v.id), q - 1)}
                    >
                      <MinusIcon />
                    </StepBtn>
                    <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-foreground">
                      {q}
                    </span>
                    <StepBtn
                      label={`Add another ${v.name}`}
                      onClick={() =>
                        add({ id: item.id, variantId: v.id, name: displayName, price_paise: v.price_paise })
                      }
                    >
                      <PlusIcon />
                    </StepBtn>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-center font-medium text-on-primary transition-[transform,background-color] duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-full text-foreground transition-[transform,background-color] duration-150 hover:bg-accent/25 active:scale-90"
    >
      {children}
    </button>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
