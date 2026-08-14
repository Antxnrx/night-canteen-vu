# Night Canteen — Setup

Get the app running end to end. Full spec: [`docs/TRD.md`](docs/TRD.md).

There are two ways to run this. **Local** needs no Supabase account and is the
right choice for development and testing. **Hosted** is what you deploy.

## Prerequisites
- Node 20+
- Docker Desktop (local path only)

```bash
npm install
```

---

# Path A — fully local (recommended for testing)

The Supabase CLI runs the whole stack in Docker on your machine: Postgres, the
REST API, Auth, and Realtime. Nothing touches supabase.com and there is no
account to create.

### 1. Start it

```bash
npx supabase start
```

First run pulls a few GB of images and takes a while. When it finishes it prints
an **API URL**, an **anon key**, and a **service_role key** — you need all three.

### 2. Point the app at it

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from the output above>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from the output above>
ADMIN_EMAIL_DOMAIN=nightcanteen.local
```

### 3. Load the schema and menu

`supabase start` applies everything in `supabase/migrations/` automatically. To
reapply from scratch at any point — this wipes local data and re-runs the seed:

```bash
npx supabase db reset
```

### 4. Create the staff account

```bash
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
node scripts/create-admin.mjs nightcanteen006969 "Night Canteen" owner
```

`read -rs` takes the password without echoing it and keeps it out of your shell
history. The script creates the auth user **and** the `admin_profiles` row —
creating only the first is the usual mistake and produces a login that
dead-ends on "Not authorized".

### 5. Run it

```bash
npm run dev
```

- Customer menu — http://localhost:3000
- Staff sign in — http://localhost:3000/admin/login
- Health probe — http://localhost:3000/api/health (expect `"ok": true`, 33 items)
- Local Supabase Studio — http://127.0.0.1:54323
- Local inbox (Mailpit) — http://127.0.0.1:54324

Stop everything with `npx supabase stop`.

> **UPI won't work locally** without Cashfree keys — see below. **Cash orders
> work with no extra setup**, so you can exercise the whole order → board →
> ready → collected flow immediately.

---

# Path B — hosted Supabase (what you deploy)

### 1. Create the project
[supabase.com](https://supabase.com) → **New project**. Pick a region close to
campus (Mumbai / `ap-south-1`). Provisioning takes a minute or two.

### 2. Keys
**Project Settings → API**:

| `.env.local` var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **server only, never `NEXT_PUBLIC_`** |

### 3. Schema + menu
**SQL Editor → New query**, paste all of
[`supabase/setup.sql`](supabase/setup.sql), run it. That file is generated from
every migration plus the seed and is safe to re-run.

> `setup.sql` is generated — don't edit it. After adding a migration, run
> `node scripts/build-setup-sql.mjs` to rebuild it.

<details><summary>Or run the migrations one at a time, in order</summary>

1. [`0001_menu.sql`](supabase/migrations/0001_menu.sql) — menu tables, public-read policies
2. [`0002_admin.sql`](supabase/migrations/0002_admin.sql) — admin profiles, audit log, `is_admin()`
3. [`0003_orders.sql`](supabase/migrations/0003_orders.sql) — sessions, orders, order items
4. [`0004_payment.sql`](supabase/migrations/0004_payment.sql) — atomic daily order number
5. [`0005_ops.sql`](supabase/migrations/0005_ops.sql) — cash, store open/closed, Realtime
6. [`0006_variants.sql`](supabase/migrations/0006_variants.sql) — size variants
7. [`0007_counter.sql`](supabase/migrations/0007_counter.sql) — counter billing (`source`)
8. [`0008_simplify_and_harden.sql`](supabase/migrations/0008_simplify_and_harden.sql) — `ready_at`, order sweeps, rate limiting
9. [`0009_grants.sql`](supabase/migrations/0009_grants.sql) — explicit table privileges (see note below)
10. [`seed.sql`](supabase/seed.sql) — the live menu

> **`0009` is not optional.** An RLS policy is not a grant. Migrations 0001–0008
> issue none and rely on Postgres default privileges; where tables are owned by
> `postgres` that yields no SELECT and *every* query fails, including the
> customer menu. `GRANT` is idempotent, so running it is safe either way.

</details>

### 4. Staff account
Same script as Path A — it reads `.env.local`, so it targets whichever project
those keys point at:

```bash
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
node scripts/create-admin.mjs nightcanteen006969 "Night Canteen" owner
```

Re-running resets the password for an existing account, which is also how you
recover a forgotten one. Make at least two accounts so one lost password can't
take the service down.

---

## Cashfree Payments

1. [cashfree.com](https://www.cashfree.com) → **Developers → API Keys**. Stay in
   **Sandbox** while developing.
2. Add to `.env.local`:
   ```bash
   CASHFREE_APP_ID=your_app_id
   CASHFREE_SECRET_KEY=your_secret_key
   CASHFREE_ENV=sandbox
   ```
3. Restart `npm run dev` and pay with Cashfree's sandbox test instruments.

**Going live:** switch `CASHFREE_ENV=production` **and** swap both keys for the
production pair. Production keys against `sandbox`, or the reverse, fails every
payment — the two environments are entirely separate.

### The webhook
Only needed once deployed to a public URL; Cashfree can't reach `localhost`.

- **Dashboard → Developers → Webhooks →** `https://<your-domain>/api/webhooks/cashfree`
- Subscribe to the **payment success** event

There is **no separate webhook secret** — Cashfree signs with your
`CASHFREE_SECRET_KEY`, so no extra variable is needed. Signature is
`base64(HMAC-SHA256(x-webhook-timestamp + rawBody))`, and deliveries older than
five minutes are rejected as replays.

Without a reachable webhook, the only thing that confirms payment is the
customer's browser returning from checkout — so someone who pays and
immediately locks their phone is charged with no order on the board.

### How confirmation works
Cashfree has no client-side signature, so nothing the browser sends is trusted.
When checkout closes, the browser only tells the server *when* to look; the
server then asks Cashfree directly and requires three things before marking an
order paid: status `PAID`, currency `INR`, and an amount matching the total we
computed. The webhook performs the identical checks. Whichever arrives first
wins, and the update is idempotent.

## Signing in

Staff sign in with a **username**, not an email — `nightcanteen006969`, not
`nightcanteen006969@…`. Supabase Auth stores it internally as
`<username>@<ADMIN_EMAIL_DOMAIN>`; that address never receives mail and the
domain doesn't have to exist. Changing `ADMIN_EMAIL_DOMAIN` after accounts exist
orphans them, so set it once and leave it.

Sign-in is rate limited in two places: a coarse per-IP limit in the proxy, and
an authoritative database-backed limit of 10 attempts per IP and 8 per account
per 15 minutes. Locking yourself out during testing clears on its own — or run
`delete from rate_limits;` in Studio.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only. Bypasses RLS. |
| `CASHFREE_APP_ID` | for UPI | Cash orders work without it |
| `CASHFREE_SECRET_KEY` | for UPI | Also signs webhooks |
| `CASHFREE_ENV` | no | `sandbox` (default) or `production` |
| `ADMIN_EMAIL_DOMAIN` | no | Default `nightcanteen.local` |
| `CAMPUS_LAT` / `CAMPUS_LON` | no | Weather accents. Defaults to Karjat. |

---

## Troubleshooting

- **"Supabase configured" is red** → keys missing or mistyped; restart `npm run dev` after editing `.env.local`.
- **"Database reachable" is red** → migrations not applied, or the URL/key points at the wrong project.
- **Login says "Not authorized"** → the auth user exists but the `admin_profiles` row doesn't. Re-run `create-admin.mjs`.
- **Counter billing fails** → migration `0007` hasn't been applied.
- **The board never clears ready orders** → migration `0008` hasn't been applied.
- **"Too many sign-in attempts"** → you hit the limiter. Wait 15 minutes, or clear `rate_limits`.
- **`npx supabase start` fails** → Docker Desktop isn't running, or ports 54321–54324 are taken by another project (`npx supabase stop --project-id <other>`).

---

### Status
- **M0–M5** complete: foundations, menu + admin CRUD, cart and server-side pricing, Cashfree UPI, live board, cash + store toggle + Realtime.
- **Since:** live menu seeded, order flow reduced to one staff action with a self-clearing board, weather- and time-aware customer UI, site-wide and per-endpoint rate limiting, IST-correct analytics, and order housekeeping sweeps.
