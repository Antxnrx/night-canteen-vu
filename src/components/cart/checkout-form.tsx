"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart, lineKey } from "@/components/cart/cart-provider";
import { createOrder } from "@/lib/actions/order";
import { verifyPayment } from "@/lib/actions/payment";
import { loadCashfree } from "@/components/cart/cashfree-checkout";
import { formatPaise } from "@/lib/format";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type Method = "upi" | "cash";

export function CheckoutForm() {
  const { lines, subtotalPaise, count, setQty, clear, hydrated } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<Method>("upi");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Stable idempotency key for this checkout attempt (once per mount).
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (!hydrated) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading your cart…</div>
    );
  }
  if (count === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
        <p className="text-base font-medium text-foreground">Your cart is empty</p>
        <p className="mt-1.5 text-sm text-muted">Add something tasty from the menu.</p>
        <Link href="/" className={cn(buttonClasses({ size: "md" }), "mt-5")}>
          Browse the menu
        </Link>
      </div>
    );
  }

  async function placeOrder() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name so we can call your order.");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    setBusy(true);

    const res = await createOrder({
      items: lines.map((l) => ({ id: l.id, variantId: l.variantId, qty: l.qty })),
      name: name.trim(),
      phone: phone.trim(),
      paymentMethod: method,
      idempotencyKey,
    });

    if ("error" in res) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Cash order (or already paid) → straight to the status page.
    if ("cash" in res || "alreadyPaid" in res) {
      clear();
      router.push(`/order/${res.orderId}`);
      return;
    }

    const cashfree = await loadCashfree(res.mode);
    if (!cashfree) {
      setError("Couldn't open the payment window. Check your connection and try again.");
      setBusy(false);
      return;
    }

    // Checkout resolves when the sheet closes — for any reason. Whether money
    // actually moved is never decided here: the server asks Cashfree directly.
    await cashfree.checkout({
      paymentSessionId: res.paymentSessionId,
      redirectTarget: "_modal",
    });

    const v = await verifyPayment(res.orderId);
    if (v.ok) {
      clear();
      router.push(`/order/${res.orderId}`);
      return;
    }

    setError(
      v.error ??
        "We couldn't confirm your payment. If money was deducted it will be refunded, or your order will appear shortly.",
    );
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {lines.map((line, i) => {
          const key = lineKey(line.id, line.variantId);
          return (
          <div
            key={key}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              i > 0 && "border-t border-border",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-foreground">
                {line.name}
              </p>
              <p className="text-sm tabular-nums text-muted">
                {formatPaise(line.price_paise)}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
              <StepBtn label={`Remove one ${line.name}`} onClick={() => setQty(key, line.qty - 1)}>
                <MinusIcon />
              </StepBtn>
              <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-foreground">
                {line.qty}
              </span>
              <StepBtn label={`Add another ${line.name}`} onClick={() => setQty(key, line.qty + 1)}>
                <PlusIcon />
              </StepBtn>
            </div>
            <div className="w-16 shrink-0 text-right text-[15px] font-medium tabular-nums text-foreground">
              {formatPaise(line.price_paise * line.qty)}
            </div>
          </div>
          );
        })}
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
        <span className="text-sm font-medium text-muted">Total</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatPaise(subtotalPaise)}
        </span>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <Field label="Your name" htmlFor="name" hint="We'll call this out when your order is ready.">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Megh Vyas"
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="So we can reach you about your order.">
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            maxLength={15}
            placeholder="10-digit number"
            autoComplete="tel"
            required
          />
        </Field>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <p className="mb-3 text-sm font-medium text-foreground">Payment</p>
        <div className="grid grid-cols-2 gap-2">
          <MethodOption
            active={method === "upi"}
            onClick={() => setMethod("upi")}
            title="UPI"
            subtitle="Pay now, instantly"
          />
          <MethodOption
            active={method === "cash"}
            onClick={() => setMethod("cash")}
            title="Cash"
            subtitle="Pay at the counter"
          />
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button onClick={placeOrder} loading={busy} size="lg" className="w-full">
        {busy
          ? "Processing…"
          : method === "upi"
            ? `Pay ${formatPaise(subtotalPaise)} with UPI`
            : `Place order · ${formatPaise(subtotalPaise)} cash`}
      </Button>
      {method === "upi" ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Secure UPI payment via Cashfree
        </p>
      ) : (
        <p className="text-center text-xs text-muted">
          Pay in cash at the counter — we&rsquo;ll start your order once it&rsquo;s received.
        </p>
      )}
    </div>
  );
}

function MethodOption({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.98]",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="block text-[15px] font-semibold text-foreground">
        {title}
      </span>
      <span className="block text-xs text-muted">{subtitle}</span>
    </button>
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
      className="grid size-8 place-items-center rounded-md text-foreground transition-[transform,background-color] duration-150 hover:bg-border active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
