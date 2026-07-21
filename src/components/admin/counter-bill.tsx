"use client";

import { useState } from "react";
import { createStaffOrder } from "@/lib/actions/counter";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import type { MenuCategoryWithItems } from "@/lib/menu";

type BillLine = {
  id: string;
  variantId: string | null;
  name: string;
  price_paise: number;
  qty: number;
};

const keyOf = (id: string, v: string | null) => `${id}::${v ?? ""}`;

export function CounterBill({ menu }: { menu: MenuCategoryWithItems[] }) {
  const [bill, setBill] = useState<BillLine[]>([]);
  const [phase, setPhase] = useState<"build" | "charge">("build");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneNumber, setDoneNumber] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const count = bill.reduce((n, l) => n + l.qty, 0);
  const total = bill.reduce((s, l) => s + l.price_paise * l.qty, 0);

  function add(id: string, variantId: string | null, name: string, price: number) {
    setBill((prev) => {
      const ex = prev.find((l) => l.id === id && l.variantId === variantId);
      return ex
        ? prev.map((l) =>
            l.id === id && l.variantId === variantId ? { ...l, qty: l.qty + 1 } : l,
          )
        : [...prev, { id, variantId, name, price_paise: price, qty: 1 }];
    });
  }
  function setQty(k: string, qty: number) {
    setBill((prev) =>
      qty <= 0
        ? prev.filter((l) => keyOf(l.id, l.variantId) !== k)
        : prev.map((l) => (keyOf(l.id, l.variantId) === k ? { ...l, qty } : l)),
    );
  }
  const qtyOfItem = (id: string) => bill.reduce((n, l) => (l.id === id ? n + l.qty : n), 0);

  function reset() {
    setBill([]);
    setName("");
    setPhone("");
    setMethod("cash");
    setPhase("build");
    setError(null);
    setDone(false);
    setDoneNumber(null);
    setExpanded(null);
  }

  async function charge() {
    setError(null);
    if (!name.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    setBusy(true);
    const res = await createStaffOrder({
      items: bill.map((l) => ({ id: l.id, variantId: l.variantId, qty: l.qty })),
      name: name.trim(),
      phone: phone.trim() || undefined,
      paymentMethod: method,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDoneNumber(res.orderNumber);
    setDone(true);
  }

  // ---- Success ----
  if (done) {
    return (
      <div className="rounded-2xl border border-success/40 bg-surface p-8 text-center shadow-card">
        <p className="text-sm text-muted">Bill created · call this number</p>
        <p className="mt-1 font-display text-6xl font-semibold tabular-nums text-foreground">
          {doneNumber != null ? `#${doneNumber}` : "—"}
        </p>
        <p className="mt-2 text-sm text-muted">
          {formatPaise(total)} · {method === "cash" ? "Cash" : "UPI"} · on the board now
        </p>
        <Button onClick={reset} size="lg" className="mt-6 w-full">
          New bill
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-6 pb-28">
        {menu.map((cat) => {
          const items = cat.items.filter((i) => i.is_available);
          if (items.length === 0) return null;
          return (
            <section key={cat.id}>
              <div className="mb-1 flex items-baseline gap-3 px-1">
                <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
                  {cat.name}
                </h2>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="divide-y divide-border">
                {items.map((item) => {
                  const variants = item.variants.filter((v) => v.is_available);
                  const hasVar = variants.length > 0;
                  const inBill = qtyOfItem(item.id);
                  const from = hasVar
                    ? Math.min(...variants.map((v) => v.price_paise))
                    : item.price_paise;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() =>
                          hasVar
                            ? setExpanded((e) => (e === item.id ? null : item.id))
                            : add(item.id, null, item.name, item.price_paise)
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-lg py-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      >
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium text-foreground">
                            {item.name}
                          </span>
                          <span className="block text-sm tabular-nums text-muted">
                            {hasVar && "from "}
                            {formatPaise(from)}
                          </span>
                        </span>
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold tabular-nums text-primary">
                          {inBill > 0 ? inBill : "+"}
                        </span>
                      </button>
                      {hasVar && expanded === item.id && (
                        <div className="flex flex-wrap gap-2 pb-3">
                          {variants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() =>
                                add(item.id, v.id, `${item.name} — ${v.name}`, v.price_paise)
                              }
                              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition-transform active:scale-95"
                            >
                              {v.name} · {formatPaise(v.price_paise)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky charge bar */}
      {count > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => setPhase("charge")}
            style={{ animation: "nc-slide-up 0.28s var(--ease-out-expo)" }}
            className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-4 rounded-full bg-primary px-5 py-3.5 text-on-primary shadow-float transition-[transform,background-color] duration-150 hover:bg-primary-hover active:scale-[0.99]"
          >
            <span className="text-sm font-semibold">
              {count} item{count === 1 ? "" : "s"} · {formatPaise(total)}
            </span>
            <span className="text-sm font-semibold">Charge →</span>
          </button>
        </div>
      )}

      {/* Charge sheet */}
      {phase === "charge" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Charge">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setPhase("build")}
            className="absolute inset-0 bg-primary-deep/50"
            style={{ animation: "nc-fade-in 0.2s ease both" }}
          />
          <div
            style={{ animation: "nc-slide-up 0.32s var(--ease-out-expo) both" }}
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <h3 className="text-lg font-semibold text-foreground">Charge the bill</h3>

            <div className="mt-3 divide-y divide-border rounded-xl border border-border">
              {bill.map((line) => {
                const k = keyOf(line.id, line.variantId);
                return (
                  <div key={k} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {line.name}
                    </span>
                    <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                      <StepBtn label="Less" onClick={() => setQty(k, line.qty - 1)}>−</StepBtn>
                      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                        {line.qty}
                      </span>
                      <StepBtn label="More" onClick={() => setQty(k, line.qty + 1)}>+</StepBtn>
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                      {formatPaise(line.price_paise * line.qty)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Total</span>
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {formatPaise(total)}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Customer name" htmlFor="cust-name">
                <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Megh Vyas" autoFocus />
              </Field>
              <Field label="Phone (optional)" htmlFor="cust-phone">
                <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={15} placeholder="For a call-out" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <MethodBtn active={method === "cash"} onClick={() => setMethod("cash")}>Cash</MethodBtn>
                <MethodBtn active={method === "upi"} onClick={() => setMethod("upi")}>UPI</MethodBtn>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button onClick={charge} loading={busy} size="lg" className="mt-4 w-full">
              {busy ? "Creating…" : `Charge ${formatPaise(total)} · ${method === "cash" ? "Cash" : "UPI"}`}
            </Button>
            <button
              type="button"
              onClick={() => setPhase("build")}
              className="mt-2 w-full py-2 text-center text-sm text-muted transition-colors hover:text-foreground"
            >
              Add more items
            </button>
          </div>
        </div>
      )}
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
      className="grid size-7 place-items-center rounded-md text-base font-semibold text-foreground transition-transform hover:bg-border active:scale-90"
    >
      {children}
    </button>
  );
}

function MethodBtn({
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
        "rounded-xl border py-2.5 text-center text-sm font-semibold transition-[transform,background-color,border-color] duration-150 active:scale-[0.98]",
        active
          ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
          : "border-border-strong text-muted hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
