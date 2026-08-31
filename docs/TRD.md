# Night Canteen — QR Ordering System
## Technical Requirements Document (TRD) — v1

**Status:** Draft for evaluation
**Date:** 2026-07-19
**Author:** Megh Vyas (Vijaybhoomi University)
**Reviewer:** Megh Vyas (final evaluation gate before development)

> This is the document to evaluate. Nothing gets built until you sign off on it.
> Priorities use: **P0 = must-have (v1 blocker)**, **P1 = should-have (v1 if time)**, **P2 = deferred (not v1)**.

---

## 1. Overview

A single food truck ("Night Canteen") on the Vijaybhoomi campus gets a QR-code ordering
system. A customer scans one QR at the truck, browses the menu on their phone, pays online
via Razorpay, and the paid order drops onto a live board the staff watch on their phone.
No app install, no counter queue.

**This is one truck, one QR, a captive campus crowd — not a multi-vendor platform.**
Every decision below is scoped to that reality. Polish and reliability are valued over
feature count.

### Non-goals (explicitly out of scope for v1)
- Multi-vendor / multiple trucks.
- Multiple tables / seat detection (single truck = single QR; orders matched by name + order number).
- Kitchen display system beyond the status board.
- Push / SMS notifications.
- Analytics / sales dashboards.
- Customer order history & reorder.
- OTP / phone verification.

---

## 2. Confirmed decisions (locked in prior discussion)

| Area | Decision | Why |
|---|---|---|
| Scale | 1 truck, 1 QR, no tables | Matches reality; simplifies data model (no table entity) |
| Customer matching | Name (required) + short **daily order number** | Names collide; a 2-digit order number is how staff & customer sync |
| Customer auth | Name + **optional** phone, server-issued **session token** (httpOnly cookie). **No OTP.** | Captive audience, low fraud, zero SMS cost. Session token = access control, not the phone |
| Payment | **Razorpay, pay upfront.** Order reaches the kitchen only after payment succeeds | Auto-reconciles money, kills prank/unpaid orders, keeps state machine simple |
| Stack | **Next.js (App Router) on Vercel + MongoDB Atlas + Razorpay in Next.js server routes** | One codebase, one deploy, secrets server-side, all free-tier |
| Admin auth | **MongoDB-backed admin auth**, a couple of email+password staff accounts | Per-person accountability + audit trail; appropriate once money flows |
| Razorpay env | **Test mode now**, swap to live keys at launch | No KYC blocker to start building/demoing |
| Admin device | **Phone-first** | Staff use their own phone at the truck |
| Timeline | Flexible (this semester) | Prioritize polish/reliability over a race to a date |
| UI | **Minimal, uncluttered, mobile-first** | Explicit requirement; fewer screens, big tap targets, one accent color |

---

## 3. Scope — features by section, with importance

### 3.1 Customer section

| # | Feature | Priority | Why it matters |
|---|---|---|---|
| C1 | QR → ordering site (single URL, optional `?t=` param reserved for future) | P0 | The entry point; without it there is no product |
| C2 | Name entry (required) + phone (optional) → session token issued | P0 | Identifies the order for call-out; token scopes "your order" access |
| C3 | Menu browse: categories, item name, price, description, availability | P0 | Core of the customer experience |
| C4 | "Sold out" items visibly disabled (cannot be added) | P0 | Prevents ordering food that isn't available |
| C5 | Cart with **quantity stepper** (add multiple of the same item) | P0 | Explicitly requested; core ordering mechanic |
| C6 | **Simple one-page checkout**: review items + total, confirm | P0 | Explicitly requested; keep it a single clean screen |
| C7 | Razorpay payment (pay upfront) | P0 | Payment is now core scope |
| C8 | Order confirmation: shows **order number** + status | P0 | The number is how the customer collects their food |
| C9 | Live order status on customer's own screen (New → Preparing → Ready → Completed) | P0 | Removes "is it ready yet?" counter anxiety |
| C10 | Item images/thumbnails | P2 | Adds visual clutter + hosting; keep menu text-first for v1. Revisit later |
| C11 | Notes / special instructions per item | P2 | Nice, but adds kitchen complexity; defer |

### 3.2 Admin section (Night Canteen staff)

| # | Feature | Priority | Why it matters |
|---|---|---|---|
| A1 | Staff login (MongoDB-backed admin auth email+password) | P0 | Gate for everything sensitive |
| A2 | **Live order board** (realtime), newest first | P0 | The staff's main working screen during a shift |
| A3 | Order card: name, order #, items+qty, total, payment status, time | P0 | Everything needed to prepare & hand off an order |
| A4 | Update order status (New → Preparing → Ready → Completed; Cancel) | P0 | The core operational loop |
| A5 | Menu management: add / edit / remove item | P0 | Staff must run the menu without a developer |
| A6 | Update prices | P0 | Prices change; must be self-serve |
| A7 | Toggle item availability ("Sold out") | P0 | Used constantly mid-shift |
| A8 | Category management | P1 | Useful for organizing a growing menu; can start with a fixed set |
| A9 | Audit log of menu/price changes & sensitive actions | P1 | Accountability; basic trail (security requirement) |
| A10 | Refund a paid & cancelled order | P1 | v1: **manual via Razorpay dashboard**, documented. Automated refunds deferred |
| A11 | Sales/analytics view | P2 | Deferred |

---

## 4. Architecture

```
[ Customer phone browser ]                 [ Staff phone browser ]
        |  (HTTPS)                                 |  (HTTPS)
        v                                          v
+-------------------------------------------------------------+
|                 Next.js app on Vercel                       |
|   - Customer pages (menu, cart, checkout, status)           |
|   - Admin pages (login, order board, menu mgmt)             |
|   - Server route handlers / server actions:                 |
|       * create order (SERVER-SIDE pricing)                  |
|       * create Razorpay order                               |
|       * verify Razorpay signature / webhook                 |
|       * status updates, menu CRUD                           |
+-------------------------------------------------------------+
        |                         |                      |
        v                         v                      v
  [ MongoDB Atlas ]   [ Polling refresh ]   [ Razorpay API ]
  [ MongoDB-backed admin auth      ]   (admin board live      (test mode now,
   (admin accounts)         updates + customer     live at launch)
                            status updates)
```

**Key principles**
- **All pricing and totals are computed server-side** from the DB. The client sends only
  `{ menu_item_id, quantity }` pairs — never a price or total.
- Razorpay **key secret and webhook secret live only in Vercel env vars**, never in the client.
- Payment truth comes from the **server-verified signature + webhook**, not the browser callback alone.
- Realtime for the admin board via Polling refresh, with **short-interval polling (~5s) as a
  reliable fallback** if Realtime misbehaves.
- Money is stored as **integer paise** (never floats) to avoid rounding bugs.

---

## 5. Data model

> Money columns are integer **paise**. Timestamps are `timestamptz`.

**`menu_categories`** — `id`, `name`, `sort_order`, `created_at`

**`menu_items`** — `id`, `category_id →`, `name`, `description`, `price_paise`,
`is_available` (bool), `sort_order`, `created_at`, `updated_at`

**`customer_sessions`** — `id` (token id), `name`, `phone` (nullable), `created_at`,
`expires_at`, `last_seen_at`
*(the opaque token lives in an httpOnly cookie and maps to this row)*

**`orders`** — `id` (uuid), `daily_order_number` (int, resets per day, assigned **on payment success**),
`session_id →`, `customer_name` (snapshot), `customer_phone` (nullable snapshot),
`status` (enum: `pending_payment` → `new` → `preparing` → `ready` → `completed` | `cancelled`),
`payment_status` (enum: `created` | `paid` | `failed` | `refunded`),
`subtotal_paise`, `total_paise` (server-computed),
`razorpay_order_id`, `razorpay_payment_id`,
`created_at`, `updated_at`, `paid_at`

**`order_items`** — `id`, `order_id →`, `menu_item_id →`,
`name_snapshot`, `unit_price_paise_snapshot`, `quantity`, `line_total_paise`
*(prices are snapshotted at order time so later menu edits never rewrite order history)*

**`admin_profiles`** — `user_id →` (MongoDB `admin_users`), `display_name`, `role`

**`audit_log`** — `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`,
`before` (jsonb), `after` (jsonb), `created_at`

**`daily_counters`** — `date`, `last_order_number` *(atomic source for the daily order number)*

---

## 6. Order & payment lifecycle

```
Customer builds cart
      |
      v
Checkout "Confirm & Pay"
      |
      v  (server)
Validate item IDs + availability + quantities
Compute subtotal/total SERVER-SIDE from DB prices
Create order  (status = pending_payment, payment_status = created)
Create Razorpay order for that exact server amount
      |
      v
Razorpay checkout opens on the phone
      |
   +--+---------------------------+
   |                              |
 SUCCESS                        FAIL / ABANDON
   |                              |
   v (server verifies signature   v
      + webhook confirms)      order stays pending_payment,
   payment_status = paid       payment_status = failed,
   assign daily_order_number   NEVER shown to kitchen,
   status = new  --------->    cleaned up
   (now visible on board)
```

Kitchen loop after payment: `new → preparing → ready → completed`.
`cancelled` is reachable from any pre-completed state; if the order was already `paid`,
v1 handles the refund **manually via the Razorpay dashboard** (documented), not automatically.

**Correctness guarantees baked in**
- **Duplicate submissions** blocked via an idempotency key per checkout attempt + disabled
  submit button + a unique constraint.
- **Order number** assigned only on payment success, so abandoned carts don't burn numbers.
- Webhook is **idempotent** (safe to receive the same event twice).

---

## 7. Auth & session model

- **Customer:** on name entry, the server mints an opaque session token → httpOnly, SameSite
  cookie. The token maps to a `customer_sessions` row and is the **only** thing that lets a
  customer read *their* order status. Sessions **expire after inactivity** and are refreshed on
  activity. Phone is optional metadata, never a security control.
- **Admin:** MongoDB-backed admin auth (email+password) for a small set of staff accounts. Admin pages and
  all admin API routes are gated by a server-side auth check **and** Row Level Security on the
  DB. Repeated failed logins are rate-limited / backed off.

---

## 8. Security requirements → how we meet them

| Requirement (non-negotiable) | How v1 satisfies it |
|---|---|
| Server-side pricing only | Totals computed in the server route from DB `price_paise`; client sends only IDs + quantities |
| Validate item IDs & quantities | Zod schema + DB check (exists, available, qty within 1..N) before order creation |
| Prevent duplicate orders | Idempotency key + unique constraint + disabled submit |
| Unique order IDs | UUID primary key + human-facing daily number |
| Separate customer/admin roles | MongoDB-backed admin auth + server checks + Row Level Security policies |
| Input validation & sanitization | Zod on every API input; reject unknown fields |
| SQL injection | MongoDB driver queries; no raw string SQL |
| XSS | React auto-escaping; sanitize any rendered free text; Content-Security-Policy header |
| CSRF | SameSite cookies; Razorpay webhook verified by signature secret |
| Rate limiting (public endpoints) | Limit on session-create + order-create (per session/IP). Start DB/Vercel-middleware based; Upstash free tier if needed |
| HTTPS everywhere | Vercel default |
| Session expiry on inactivity | `customer_sessions.expires_at`, refreshed on activity |
| Audit trail for admin actions | `audit_log` rows on menu/price/availability changes |
| Failed-login monitoring | MongoDB-backed admin auth + lockout/backoff on repeated failures |
| Payment integrity | Razorpay signature + webhook verification server-side; secrets in env only |

---

## 9. UI / UX principles

**Minimal, uncluttered, mobile-first.** Few screens, big tap targets, one accent color,
generous spacing, text-first menu (no image clutter in v1). Detailed visual design happens
in the build phase using the frontend-design skills — this section sets the guardrails.

**Customer screens (4):**
1. **Welcome / name entry** — one field (name), optional phone, "Start ordering".
2. **Menu** — categories, items with price + qty stepper, running cart summary bar.
3. **Checkout** — single page: item list, editable quantities, total, "Confirm & Pay".
4. **Order status** — big order number + live status pill.

**Admin screens (3):**
1. **Login.**
2. **Live order board** (default) — status columns/list, tap a card to advance status.
3. **Menu management** — list with inline edit, price, availability toggle, add/remove.

---

## 10. Milestone roadmap (build order + why)

**Ordering principle:** build the data backbone first, prove ordering + server-side pricing
*without* money, then add money on a proven base, then realtime ops, then harden. The two
riskiest things — **correct pricing** and **payments** — are isolated so each can be tested
on its own.

### M0 — Foundations & scaffolding
Next.js (App Router, TypeScript) + Tailwind, deployed to Vercel. MongoDB database + collections
migrations + env wiring. Minimal design tokens. **Why first:** nothing runs without the
skeleton and DB.
**Done when:** app is deployed, DB reachable, one seeded menu item renders end-to-end.

### M1 — Menu + Admin menu management
DB tables for categories/items. Admin login (MongoDB-backed admin auth) + protected admin area. Admin
menu CRUD (add/edit/remove, price, availability, category). Customer read-only menu browse.
**Why second:** the menu is the data everything else depends on; you can't order what doesn't
exist, and staff need to enter real menu data to test against.
**Done when:** staff manage a real menu on their phone; customers see it with availability.

### M2 — Cart + ordering (no payment yet)
Session token (name + optional phone). Cart with quantity steppers. Simple checkout page.
Server-side order creation: validate IDs/availability/quantities, compute total server-side,
create order in `pending_payment`, duplicate-submit protection.
**Why third:** get ordering + pricing integrity rock-solid in isolation before money is
involved — far easier to debug.
**Done when:** a customer builds a cart and submits; the server computes the correct total;
the order lands in the DB.

### M3 — Razorpay payment (pay upfront)
Server creates a Razorpay order for the server-computed amount; checkout opens Razorpay;
success → signature + webhook verification → order becomes `paid` + `new` (enters kitchen) +
gets its daily number; failure → never reaches the kitchen. Store Razorpay IDs.
**Why fourth:** payments are the highest-risk piece; build them on a proven order flow and
test thoroughly with Razorpay test cards.
**Done when:** a test-mode payment moves an order onto the live queue; a failed payment does not.

### M4 — Live admin board + status flow
Staff order board (paid orders, newest-first) with status transitions New → Preparing →
Ready → Completed (+ Cancel). Board and customer status page both **poll (~4s)** — chosen
over Realtime for reliability/simplicity; upgradable later. Customer sees their own status live.
**Why fifth:** ties the operational loop together once there are real paid orders to move.
**Done when:** staff run a full shift loop and the customer's screen reflects status changes.

### M5 — Admin login hardening
Login **rate-limit + lockout** (DB-based), **Cloudflare Turnstile CAPTCHA**, **TOTP 2FA**
(enroll + challenge via admin MFA), and failed-login logging with a recent-security-events
view. Email alerts deferred to M8.
**Why here:** the admin surface holds money + menu control; harden it before wider exposure.
**Done when:** login resists brute-force/stuffing and requires a second factor for staff.

### M6 — Analytics dashboard
Admin `/analytics`: total sales, order count, avg order value, sales-over-time, best-sellers,
sales-by-hour, category split — with charts; Today / 7-day / All-time filters. Computed
on-demand with SQL aggregates over **paid** orders (no rollup infra).
**Done when:** staff can see sales + best-sellers for a chosen window.

### M7 — Menu enhancements
Item/category **reordering** (up/down), category **rename/delete** (safeguarded), and optional
**item photos** (object storage; text-only items still look clean).
**Done when:** staff fully control menu structure + imagery from their phone.

### M8 — Launch hardening
Session expiry, XSS/CSRF/injection pass, empty/error/loading states, real-phone QA, email
alerts for failed logins, CSP, and the **live Razorpay keys + webhook** swap.
**Why last:** with all flows proven, lock in reliability before launch.
**Done when:** v1 is launch-ready and passes a security + mobile QA checklist.

---

## 11. Non-functional requirements
- Fast on campus 4G; mobile-first performance budget.
- Realtime updates within a couple of seconds; graceful polling fallback.
- Stays within free tiers (Vercel, MongoDB Atlas, payment sandbox).
- Correct money handling (integer paise, server-authoritative totals).

---

## 12. Open risks & dependencies
- **Razorpay KYC** for *live* payments needs the truck owner's business/individual verification.
  Not a blocker now (test mode), but required before real launch.
- **Refunds** are manual in v1 (Razorpay dashboard). If cancellations turn out to be frequent,
  automate later.
- **Rate-limit store**: start simple (DB/middleware); add Upstash free tier only if needed.

---

## 13. v1 acceptance criteria
- A customer can scan → enter name → browse → add multiple quantities → checkout → pay (test
  mode) → see a live status, all on a phone.
- A paid order — and only a paid order — appears on the staff board in near-real-time.
- Staff can advance status and manage the menu (price + availability) from a phone.
- No price or total is ever trusted from the client.
- The security checklist in §8 is satisfied.
```
