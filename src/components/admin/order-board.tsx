"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { setOrderStatus, confirmCashPayment } from "@/lib/actions/order-status";
import { createClient } from "@/lib/supabase/client";
import {
  READY_WINDOW_MS,
  isCooking,
  type BoardOrder,
  type OrderStatus,
} from "@/lib/order-status";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/cn";

const POLL_MS = 5000; // safety net; Realtime handles the instant path
const TICK_MS = 10000; // drives the auto-clear countdown
const STALE_MS = 30 * 60 * 1000; // unpaid > 30 min → greyed

/**
 * The kitchen board. Built for a cook holding a phone with wet hands mid-rush,
 * so it optimises for glanceability over density: one order per full-width card,
 * the number set enormous, and exactly one button to press.
 *
 * Ready orders retire themselves after READY_WINDOW_MS — filtered out here for
 * an instant response, and made durable by `sweep_orders()` on the server so it
 * still happens when nobody is looking at the screen.
 */
export function OrderBoard({ initial }: { initial: BoardOrder[] }) {
  const [orders, setOrders] = useState<BoardOrder[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);

  const seenIds = useRef<Set<string>>(new Set(initial.map((o) => o.id)));
  const audioRef = useRef<AudioContext | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { orders?: BoardOrder[] };
      if (Array.isArray(data.orders)) setOrders(data.orders);
    } catch {
      // transient — the next tick / realtime event recovers
    }
  }, []);

  // Realtime push + fallback poll + focus refresh.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Authorize BEFORE subscribing. `orders` has no anon policy, so a channel
    // that opens unauthenticated silently receives nothing and the board would
    // quietly fall back to the 5s poll for the rest of the night.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("admin-orders")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => refresh(),
        )
        .subscribe();
    })();

    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Tick for staleness + the ready countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Chime when a genuinely new order arrives (not on optimistic edits).
  useEffect(() => {
    const fresh = orders.filter((o) => !seenIds.current.has(o.id));
    seenIds.current = new Set(orders.map((o) => o.id));
    if (soundOn && fresh.length > 0) beep(audioRef);
  }, [orders, soundOn]);

  const markReady = useCallback(
    (order: BoardOrder) => {
      setError(null);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: "ready" as OrderStatus, ready_at: new Date().toISOString() }
            : o,
        ),
      );
      startTransition(async () => {
        const res = await setOrderStatus(order.id, "ready");
        if (!res.ok) setError(res.error ?? "Couldn't update the order.");
        refresh();
      });
    },
    [refresh],
  );

  const cancel = useCallback(
    (order: BoardOrder) => {
      setError(null);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      startTransition(async () => {
        const res = await setOrderStatus(order.id, "cancelled");
        if (!res.ok) setError(res.error ?? "Couldn't cancel the order.");
        refresh();
      });
    },
    [refresh],
  );

  const cashReceived = useCallback(
    (order: BoardOrder) => {
      setError(null);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, payment_status: "paid" as const, status: "new" as OrderStatus }
            : o,
        ),
      );
      startTransition(async () => {
        const res = await confirmCashPayment(order.id);
        if (!res.ok) setError(res.error ?? "Couldn't confirm the cash payment.");
        refresh();
      });
    },
    [refresh],
  );

  const groups = useMemo(() => {
    const byAge = (a: BoardOrder, b: BoardOrder) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    const paid = (o: BoardOrder) => o.payment_status === "paid";

    // Ready orders past their window vanish immediately, without waiting for
    // the server sweep to come back.
    const readyLive = (o: BoardOrder) => {
      if (o.status !== "ready") return false;
      if (!o.ready_at) return true;
      return now - new Date(o.ready_at).getTime() < READY_WINDOW_MS;
    };

    return {
      awaiting: orders.filter((o) => !paid(o)).sort(byAge),
      cooking: orders.filter((o) => paid(o) && isCooking(o.status)).sort(byAge),
      ready: orders.filter((o) => paid(o) && readyLive(o)).sort(byAge),
    };
  }, [orders, now]);

  const total = groups.awaiting.length + groups.cooking.length + groups.ready.length;

  return (
    <div className="pb-24">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-danger-bg px-4 py-3 text-[15px] font-medium text-danger"
        >
          {error}
        </p>
      )}

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-20 text-center">
          <PotIcon className="mx-auto size-10 text-border-strong" />
          <p className="mt-4 text-lg font-semibold text-foreground">All done</p>
          <p className="mx-auto mt-1 max-w-[22ch] text-[15px] text-muted">
            New orders appear here on their own.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.awaiting.length > 0 && (
            <Section
              icon={<CashIcon className="size-5" />}
              title="Take cash"
              count={groups.awaiting.length}
              tone="accent"
            >
              {groups.awaiting.map((o) => (
                <CashCard
                  key={o.id}
                  order={o}
                  now={now}
                  busy={pending}
                  onCashReceived={cashReceived}
                  onCancel={cancel}
                />
              ))}
            </Section>
          )}

          {groups.cooking.length > 0 && (
            <Section
              icon={<PotIcon className="size-5" />}
              title="Cooking"
              count={groups.cooking.length}
              tone="primary"
            >
              {groups.cooking.map((o) => (
                <CookingCard
                  key={o.id}
                  order={o}
                  now={now}
                  busy={pending}
                  onReady={markReady}
                  onCancel={cancel}
                />
              ))}
            </Section>
          )}

          {groups.ready.length > 0 && (
            <Section
              icon={<CheckIcon className="size-5" />}
              title="Ready"
              count={groups.ready.length}
              tone="success"
            >
              {groups.ready.map((o) => (
                <ReadyCard key={o.id} order={o} now={now} />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* Sound lives at the bottom, out of the way of the cook's thumb path. */}
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setSoundOn((v) => {
              const next = !v;
              if (next) ensureAudio(audioRef); // unlock audio on the gesture
              return next;
            });
          }}
          aria-pressed={soundOn}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition-colors active:bg-surface-2"
        >
          {soundOn ? <SpeakerOn /> : <SpeakerOff />}
          {soundOn ? "Sound on" : "Sound off"}
        </button>
      </div>
    </div>
  );
}

/* ── sections ─────────────────────────────────────────────────────────── */

function Section({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: "accent" | "primary" | "success";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className={cn(
          "mb-2.5 flex items-center gap-2 px-0.5",
          tone === "success" && "text-success",
          tone === "accent" && "text-accent-hover",
          tone === "primary" && "text-primary",
        )}
      >
        {icon}
        <h2 className="text-base font-bold uppercase tracking-wide">{title}</h2>
        <span className="grid size-6 place-items-center rounded-full bg-current text-sm font-bold tabular-nums">
          <span className="text-surface">{count}</span>
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/* ── cards ────────────────────────────────────────────────────────────── */

/** The number + the food. Shared by every card so the cook's eye never moves. */
function CardHead({
  order,
  now,
  children,
}: {
  order: BoardOrder;
  now: number;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-display text-5xl font-bold leading-none tabular-nums text-foreground">
          {order.daily_order_number ? `#${order.daily_order_number}` : "—"}
        </span>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums text-muted">
            {timeAgo(order.created_at, now)}
          </span>
          {children}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {order.order_items.map((it, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="grid min-w-8 shrink-0 place-items-center rounded-lg bg-surface-2 px-2 py-0.5 text-lg font-bold tabular-nums text-foreground">
              {it.quantity}
            </span>
            <span className="text-lg font-medium leading-snug text-foreground">
              {it.name_snapshot}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function CookingCard({
  order,
  now,
  busy,
  onReady,
  onCancel,
}: {
  order: BoardOrder;
  now: number;
  busy: boolean;
  onReady: (o: BoardOrder) => void;
  onCancel: (o: BoardOrder) => void;
}) {
  return (
    <article className="animate-enter rounded-2xl border border-border bg-surface p-4 shadow-card">
      <CardHead order={order} now={now} />

      {/* The one button. Full width, thumb-height, unmistakable. */}
      <button
        type="button"
        onClick={() => onReady(order)}
        disabled={busy}
        className="mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-success text-xl font-bold uppercase tracking-wide text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-success/30"
      >
        <CheckIcon className="size-7" />
        Ready
      </button>

      <CardFoot order={order} busy={busy} onCancel={onCancel} />
    </article>
  );
}

function CashCard({
  order,
  now,
  busy,
  onCashReceived,
  onCancel,
}: {
  order: BoardOrder;
  now: number;
  busy: boolean;
  onCashReceived: (o: BoardOrder) => void;
  onCancel: (o: BoardOrder) => void;
}) {
  const stale = now - new Date(order.created_at).getTime() > STALE_MS;

  return (
    <article
      className={cn(
        "animate-enter rounded-2xl border-2 border-accent bg-surface p-4 shadow-card",
        stale && "opacity-55",
      )}
    >
      <CardHead order={order} now={now} />

      <button
        type="button"
        onClick={() => onCashReceived(order)}
        disabled={busy}
        className="mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-accent text-xl font-bold uppercase tracking-wide text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
      >
        <CashIcon className="size-7" />
        Got {formatPaise(order.total_paise)}
      </button>

      <CardFoot order={order} busy={busy} onCancel={onCancel} />
    </article>
  );
}

function ReadyCard({ order, now }: { order: BoardOrder; now: number }) {
  const leftMs = order.ready_at
    ? READY_WINDOW_MS - (now - new Date(order.ready_at).getTime())
    : READY_WINDOW_MS;
  const leftMin = Math.max(1, Math.ceil(leftMs / 60000));

  return (
    <article className="animate-enter flex items-center gap-4 rounded-2xl border border-success/50 bg-success-bg px-4 py-3.5">
      <span className="font-display text-3xl font-bold leading-none tabular-nums text-success">
        {order.daily_order_number ? `#${order.daily_order_number}` : "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
        {order.order_items.map((it) => `${it.quantity}× ${it.name_snapshot}`).join(", ")}
      </span>
      <span className="shrink-0 text-xs font-medium tabular-nums text-success">
        {leftMin}m
      </span>
    </article>
  );
}

/** Customer name + a deliberately small cancel — never next to the main button. */
function CardFoot({
  order,
  busy,
  onCancel,
}: {
  order: BoardOrder;
  busy: boolean;
  onCancel: (o: BoardOrder) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
      <span className="min-w-0 truncate text-sm text-muted">
        {order.customer_name}
        {order.customer_phone && ` · ${order.customer_phone}`}
      </span>
      <button
        type="button"
        onClick={() => {
          const label = order.daily_order_number
            ? `#${order.daily_order_number}`
            : "this order";
          if (window.confirm(`Cancel ${label}?`)) onCancel(order);
        }}
        disabled={busy}
        className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted transition-colors active:bg-danger-bg active:text-danger disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
      >
        Cancel
      </button>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function timeAgo(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr`;
}

function ensureAudio(ref: RefObject<AudioContext | null>): AudioContext | null {
  try {
    if (!ref.current && typeof window !== "undefined" && window.AudioContext) {
      ref.current = new window.AudioContext();
    }
    if (ref.current?.state === "suspended") void ref.current.resume();
    return ref.current;
  } catch {
    return null;
  }
}

function beep(ref: RefObject<AudioContext | null>) {
  const ctx = ensureAudio(ref);
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.31);
  } catch {
    // ignore audio errors
  }
}

/* ── icons ────────────────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </svg>
  );
}

function PotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
      <path d="M2 10h20" />
      <path d="M9 6.5c0-1 1-1.5 1-2.5M14 6.5c0-1 1-1.5 1-2.5" />
    </svg>
  );
}

function CashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function SpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m17 9 4 6M21 9l-4 6" />
    </svg>
  );
}
