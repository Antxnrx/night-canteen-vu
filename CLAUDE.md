@AGENTS.md

# Night Canteen — QR Ordering System

Single food-truck QR ordering app for the Vijaybhoomi campus. A customer scans one
QR, browses the menu, and pays via Razorpay on their phone; staff manage orders and
the menu from a phone dashboard.

- **Full spec:** `docs/TRD.md`
- **Local setup:** `SETUP.md`

## Stack
- **Next.js 16** (App Router, TypeScript) + **Tailwind v4**, deploy target **Vercel**.
- **MongoDB Atlas** for menu, orders, sessions, admin accounts, counters, audit logs, and rate limits.
- **Cashfree/Razorpay-era payment flow** (pay-upfront), server-side only. **Sandbox/test mode** during dev.

## Non-negotiable rules
- **All prices/totals are computed server-side** from the DB. Never trust a client-sent price or total.
- Money is stored and computed as **integer paise**, never floats/decimals.
- Payment secrets and MongoDB credentials live only in server env — never `NEXT_PUBLIC_`.
- Customers are identified by a **server-issued session token** (httpOnly cookie), not by phone. No OTP in v1.

## Layout
- `src/app/` — routes: customer + admin pages, and `api/*/route.ts` route handlers.
- `src/lib/mongodb/` — MongoDB connection, query compatibility adapter, and admin auth helpers.
- `src/lib/` — `env.ts` (env access), plus data-access + domain helpers.

## Build order (milestones — see TRD §10)
M0 foundations → M1 menu + admin CRUD → M2 cart/order (server pricing) → M3 Razorpay →
M4 live board + status → M5 hardening. Build + verify one milestone at a time.

## Next 16 conventions
- Server Components by default; add `'use client'` only for interactivity.
- `cookies()`, `headers()`, and route `params` are **async** — always `await`.
- Route handlers are uncached by default (fine for our dynamic APIs).
- The bundled docs at `node_modules/next/dist/docs/` are the source of truth for this version.
