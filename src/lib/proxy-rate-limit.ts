/**
 * Site-wide rate limiting, evaluated in the proxy before a request reaches the
 * app.
 *
 * Deliberately in-memory. The DB-backed counter used for order creation would
 * add a database round trip to *every* request on the site — including the
 * board poll every 5 seconds and every waiting customer's status refresh. That
 * costs more than the abuse it prevents.
 *
 * The trade-off: counters are per-instance, so with N warm instances the real
 * ceiling is roughly N × limit. That is fine for what this layer is — a flood
 * guard, not a quota. Anything needing an exact, cross-instance limit (placing
 * an order, signing in) is ALSO checked against the database, which is
 * authoritative.
 *
 * ── Why the limits below look generous ──────────────────────────────────────
 * Campus wifi is behind NAT, so every phone at the canteen shares ONE public
 * IP. A strict per-IP page limit would throttle the entire queue the moment the
 * place got busy — the exact opposite of what this is for. So:
 *
 *   · Browsing traffic is keyed on the customer's session cookie where there is
 *     one, which is per-person and survives NAT.
 *   · The IP fallback (visitors with no session yet) is set high enough that a
 *     crowd never reaches it, but a script still does.
 *   · Sign-in is the exception: it stays strictly per-IP, because that is the
 *     thing actually worth defending and an attacker can mint cookies freely.
 *     Credential attacks spread across many IPs are caught instead by the
 *     per-account database limit in `signIn`.
 *
 * No dependency on Supabase: plain memory, holds through any database change.
 */

export type Tier = "auth" | "api" | "page";

const LIMITS: Record<Tier, { max: number; windowMs: number }> = {
  // Sign-in attempts per IP. A human types a password a few times; a script
  // tries thousands. Tight on purpose.
  auth: { max: 10, windowMs: 5 * 60_000 },
  // Route handlers + server actions. Staff boards poll every 5s (~12/min each).
  api: { max: 600, windowMs: 60_000 },
  // Page loads, including every waiting customer's 5s status refresh.
  page: { max: 1200, windowMs: 60_000 },
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

let lastPrune = Date.now();
const PRUNE_EVERY_MS = 60_000;
const MAX_BUCKETS = 20_000;

/** Drop expired buckets so a long-lived instance can't leak memory. */
function prune(now: number) {
  if (now - lastPrune < PRUNE_EVERY_MS && buckets.size < MAX_BUCKETS) return;
  lastPrune = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  // Pathological case (someone rotating cookies): drop everything rather than
  // grow without bound. Costs one window of accuracy, never memory.
  if (buckets.size > MAX_BUCKETS) buckets.clear();
}

export type Decision = {
  ok: boolean;
  /** Seconds until the window resets — sent as Retry-After on a block. */
  retryAfter: number;
};

export function check(identity: string, tier: Tier): Decision {
  const now = Date.now();
  prune(now);

  const { max, windowMs } = LIMITS[tier];
  const key = `${tier}:${identity}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Which bucket a request belongs to. */
export function tierFor(pathname: string, method: string): Tier {
  // Only POSTs to the login route are sign-in attempts; loading the page isn't.
  if (pathname.startsWith("/admin/login")) {
    return method === "POST" ? "auth" : "page";
  }
  if (pathname.startsWith("/api/")) return "api";
  // Server actions arrive as POSTs to ordinary page routes.
  if (method === "POST") return "api";
  return "page";
}

/**
 * Best-effort client IP. On Vercel the edge sets `x-forwarded-for` and the first
 * entry is the real client. Unknown clients share a bucket, which throttles them
 * against each other rather than letting them through free.
 */
export function ipFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Who to count this request against.
 *
 * Sign-in always counts per IP — cookies are attacker-controlled, so keying on
 * one would let a brute-forcer reset their own limit at will. Everything else
 * prefers the session cookie so a NATed crowd isn't treated as one visitor.
 */
export function identityFor(
  tier: Tier,
  headers: Headers,
  sessionToken: string | undefined,
): string {
  if (tier === "auth") return `ip:${ipFrom(headers)}`;
  if (sessionToken) return `s:${sessionToken.slice(0, 24)}`;
  return `ip:${ipFrom(headers)}`;
}

/**
 * The payment webhook must never be throttled: Cashfree is the source of truth
 * for payment, it arrives from Cashfree's IPs rather than a customer's, and a
 * dropped delivery means someone paid and got no food.
 */
export function isExempt(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/");
}
