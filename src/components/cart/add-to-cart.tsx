"use client";

import { useCart, lineKey } from "./cart-provider";

/** Circular add button that becomes a compact −/qty/＋ stepper once in the cart. */
export function AddToCart({
  id,
  name,
  pricePaise,
  available,
}: {
  id: string;
  name: string;
  pricePaise: number;
  available: boolean;
}) {
  const { qtyOf, add, setQty, hydrated } = useCart();
  const qty = qtyOf(id);

  if (!available) {
    return (
      <span className="inline-block whitespace-nowrap text-xs font-medium text-danger">
        Sold out
      </span>
    );
  }

  if (!hydrated || qty === 0) {
    return (
      <button
        type="button"
        onClick={() => add({ id, name, price_paise: pricePaise })}
        aria-label={`Add ${name}`}
        className="grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent-hover active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <PlusIcon />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-full bg-accent/12 p-0.5">
      <StepBtn label={`Remove one ${name}`} onClick={() => setQty(lineKey(id, null), qty - 1)}>
        <MinusIcon />
      </StepBtn>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-foreground">
        {qty}
      </span>
      <StepBtn
        label={`Add another ${name}`}
        onClick={() => add({ id, name, price_paise: pricePaise })}
      >
        <PlusIcon />
      </StepBtn>
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
      className="grid size-7 place-items-center rounded-full text-foreground transition-[transform,background-color] duration-150 hover:bg-accent/25 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
