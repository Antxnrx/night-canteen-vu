-- ============================================================================
-- setup.sql — GENERATED FILE. Do not edit by hand.
--
-- Every migration plus the seed, concatenated in order. Paste the whole file
-- into the Supabase SQL editor and run it once. Safe to re-run: every
-- statement is idempotent.
--
-- Regenerate with:  node scripts/build-setup-sql.mjs
-- Contains: 0001_menu.sql, 0002_admin.sql, 0003_orders.sql, 0004_payment.sql, 0005_ops.sql, 0006_variants.sql, 0007_counter.sql, 0008_simplify_and_harden.sql, 0009_grants.sql, seed.sql
-- ============================================================================

-- ============================================================================
-- 0001_menu.sql  —  Night Canteen (Milestone M0)
-- Menu backbone: categories + items. Public read; no public writes.
-- Admin write policies are added in Milestone M1.
-- Money is stored as INTEGER PAISE (never floats).
-- Run this in the Supabase SQL editor (see SETUP.md), then run supabase/seed.sql.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Keeps updated_at fresh on row updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid        references public.menu_categories(id) on delete set null,
  name         text        not null,
  description  text,
  price_paise  int         not null check (price_paise >= 0),
  is_available boolean     not null default true,
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists menu_items_category_idx on public.menu_items(category_id);

drop trigger if exists menu_items_set_updated_at on public.menu_items;
create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security
-- With RLS enabled and only SELECT policies below, anon/authenticated can read
-- the menu but cannot write. Seeding via the SQL editor runs as a privileged
-- role and bypasses RLS. Admin write policies come in M1.
-- --------------------------------------------------------------------------
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;

drop policy if exists "menu_categories public read" on public.menu_categories;
create policy "menu_categories public read"
  on public.menu_categories for select
  to anon, authenticated
  using (true);

drop policy if exists "menu_items public read" on public.menu_items;
create policy "menu_items public read"
  on public.menu_items for select
  to anon, authenticated
  using (true);

-- ============================================================================
-- 0002_admin.sql  —  Night Canteen (Milestone M1)
-- Admin identity + audit trail + admin write access to the menu.
-- Run in the Supabase SQL editor after 0001_menu.sql. Then create a staff
-- account (see SETUP.md → "Create an admin account").
-- ============================================================================

-- --------------------------------------------------------------------------
-- Admin profiles: one row per staff member, linked to a Supabase Auth user.
-- --------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null default 'Staff',
  role         text        not null default 'staff' check (role in ('staff', 'owner')),
  created_at   timestamptz not null default now()
);

-- Is the current request an admin? SECURITY DEFINER so it can read
-- admin_profiles regardless of that table's own RLS (avoids recursion).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_profiles enable row level security;

drop policy if exists "admin_profiles self read" on public.admin_profiles;
create policy "admin_profiles self read"
  on public.admin_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- --------------------------------------------------------------------------
-- Admin write access to the menu (public read policies stay from 0001).
-- --------------------------------------------------------------------------
drop policy if exists "menu_categories admin write" on public.menu_categories;
create policy "menu_categories admin write"
  on public.menu_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "menu_items admin write" on public.menu_items;
create policy "menu_items admin write"
  on public.menu_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --------------------------------------------------------------------------
-- Audit log: sensitive admin actions (menu changes, etc.).
-- --------------------------------------------------------------------------
create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references auth.users(id) on delete set null,
  action         text        not null,          -- e.g. 'menu_item.create'
  entity_type    text        not null,          -- e.g. 'menu_item'
  entity_id      uuid,
  summary        text,                            -- human-readable one-liner
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log admin read" on public.audit_log;
create policy "audit_log admin read"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

drop policy if exists "audit_log admin insert" on public.audit_log;
create policy "audit_log admin insert"
  on public.audit_log for insert
  to authenticated
  with check (public.is_admin() and actor_user_id = auth.uid());

-- ============================================================================
-- 0003_orders.sql  —  Night Canteen (Milestone M2)
-- Customer sessions + cart→order. Money stays INTEGER PAISE, computed server-side.
-- Customers are NOT Supabase-authed: they carry an opaque session token in an
-- httpOnly cookie. So customer order access happens only server-side via the
-- service role, scoped by that token in app code. RLS therefore gives customers
-- NO direct access; staff (authenticated admins) can read orders + set status.
-- Run in the Supabase SQL editor after 0002_admin.sql.
-- ============================================================================

-- Enums (guard against re-run) -------------------------------------------------
do $$ begin
  create type public.order_status as enum
    ('pending_payment', 'new', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum
    ('created', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- Customer sessions ------------------------------------------------------------
create table if not exists public.customer_sessions (
  id           uuid        primary key default gen_random_uuid(),
  token        text        not null unique,          -- opaque bearer, in httpOnly cookie
  name         text        not null,
  phone        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days')
);

-- Orders -----------------------------------------------------------------------
create table if not exists public.orders (
  id                 uuid                  primary key default gen_random_uuid(),
  daily_order_number int,                                       -- assigned on payment (M3)
  session_id         uuid                  references public.customer_sessions(id) on delete set null,
  customer_name      text                  not null,
  customer_phone     text,
  status             public.order_status   not null default 'pending_payment',
  payment_status     public.payment_status not null default 'created',
  subtotal_paise     int                   not null check (subtotal_paise >= 0),
  total_paise        int                   not null check (total_paise >= 0),
  idempotency_key    text                  unique,              -- blocks duplicate submits
  razorpay_order_id  text,
  razorpay_payment_id text,
  created_at         timestamptz           not null default now(),
  updated_at         timestamptz           not null default now(),
  paid_at            timestamptz
);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_status_idx  on public.orders(status);
create index if not exists orders_session_idx on public.orders(session_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Order items (price snapshots at order time) ----------------------------------
create table if not exists public.order_items (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders(id) on delete cascade,
  menu_item_id              uuid references public.menu_items(id) on delete set null,
  name_snapshot             text not null,
  unit_price_paise_snapshot int  not null check (unit_price_paise_snapshot >= 0),
  quantity                  int  not null check (quantity > 0),
  line_total_paise          int  not null check (line_total_paise >= 0)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Daily human-facing order numbers (used at payment, M3) -----------------------
create table if not exists public.daily_counters (
  day               date primary key,
  last_order_number int  not null default 0
);

-- Row Level Security -----------------------------------------------------------
alter table public.customer_sessions enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.daily_counters    enable row level security;

-- Staff can read orders + items and update order status. No anon/customer
-- policies anywhere here → those tables are reachable only via the service role
-- (server-side), which is exactly how customer order flows run.
drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read"
  on public.orders for select to authenticated using (public.is_admin());

drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update"
  on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items admin read" on public.order_items;
create policy "order_items admin read"
  on public.order_items for select to authenticated using (public.is_admin());

-- ============================================================================
-- 0004_payment.sql  —  Night Canteen (Milestone M3)
-- Atomic per-day human order number, assigned when an order is paid.
-- Run in the Supabase SQL editor after 0003_orders.sql.
-- ============================================================================

-- Returns the next order number for today, incrementing atomically. The upsert
-- takes a row lock, so concurrent payments never get the same number.
create or replace function public.next_daily_order_number()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.daily_counters (day, last_order_number)
  values (current_date, 1)
  on conflict (day)
    do update set last_order_number = daily_counters.last_order_number + 1
  returning last_order_number into n;
  return n;
end;
$$;

revoke all on function public.next_daily_order_number() from public, anon, authenticated;

-- ============================================================================
-- 0005_ops.sql  —  Night Canteen (Milestone M5 — Operations v2)
-- Cash payments, store open/closed switch, and Realtime for orders + menu.
-- Run in the Supabase SQL editor after 0004_payment.sql.
-- ============================================================================

-- Payment method on orders ('upi' verified upfront, 'cash' confirmed by staff) --
alter table public.orders
  add column if not exists payment_method text
  check (payment_method in ('upi', 'cash'));

-- Store open/closed (single row) -----------------------------------------------
create table if not exists public.store_settings (
  id         int         primary key default 1 check (id = 1),
  is_open    boolean     not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users(id) on delete set null
);
insert into public.store_settings (id, is_open) values (1, true)
  on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "store_settings public read" on public.store_settings;
create policy "store_settings public read"
  on public.store_settings for select to anon, authenticated using (true);

drop policy if exists "store_settings admin update" on public.store_settings;
create policy "store_settings admin update"
  on public.store_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Realtime: publish changes for the live board (orders) + live menu (menu_items).
-- Idempotent — only add if not already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table public.menu_items;
  end if;
end $$;

-- ============================================================================
-- 0006_variants.sql  —  Night Canteen (size variants)
-- Optional per-item sizes (e.g. Small / Large). An item with variants makes the
-- customer pick one; an item with none uses its base price_paise as today.
-- Money stays INTEGER PAISE. Run after 0005_ops.sql.
-- ============================================================================

create table if not exists public.menu_item_variants (
  id           uuid        primary key default gen_random_uuid(),
  item_id      uuid        not null references public.menu_items(id) on delete cascade,
  name         text        not null,
  price_paise  int         not null check (price_paise >= 0),
  sort_order   int         not null default 0,
  is_available boolean     not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists menu_item_variants_item_idx
  on public.menu_item_variants(item_id);

-- Which variant an order line was for (nullable — most items have no variants).
alter table public.order_items
  add column if not exists variant_id uuid
  references public.menu_item_variants(id) on delete set null;

-- RLS: public read (like the menu), admin write.
alter table public.menu_item_variants enable row level security;

drop policy if exists "menu_item_variants public read" on public.menu_item_variants;
create policy "menu_item_variants public read"
  on public.menu_item_variants for select to anon, authenticated using (true);

drop policy if exists "menu_item_variants admin write" on public.menu_item_variants;
create policy "menu_item_variants admin write"
  on public.menu_item_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Realtime so size/price changes reflect on the live menu.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'menu_item_variants'
  ) then
    alter publication supabase_realtime add table public.menu_item_variants;
  end if;
end $$;

-- ============================================================================
-- 0007_counter.sql  —  Night Canteen (staff-side counter billing)
-- Tags where an order came from so staff can bill walk-up/verbal customers who
-- don't scan the QR. Run after 0006_variants.sql.
-- ============================================================================

alter table public.orders
  add column if not exists source text not null default 'qr'
  check (source in ('qr', 'counter'));

-- ============================================================================
-- 0008_simplify_and_harden.sql  —  Night Canteen
-- Three things:
--   1. `ready_at` — when the cook tapped Ready. Drives the 10-minute auto-clear
--      that keeps the board short without asking the cook for a second tap.
--   2. `sweep_orders()` — housekeeping. Retires collected orders off the board
--      and cancels UPI checkouts that were abandoned at the payment sheet.
--   3. `rate_limits` + `bump_rate_limit()` — an atomic, DB-backed counter, so
--      the limit holds across serverless instances (in-memory would not).
-- Run in the Supabase SQL editor after 0007_counter.sql.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. When the order became ready (null until the cook taps Ready)
-- --------------------------------------------------------------------------
alter table public.orders
  add column if not exists ready_at timestamptz;

-- The board reads active orders constantly; this keeps that query on an index.
create index if not exists orders_ready_at_idx
  on public.orders(ready_at)
  where ready_at is not null;

-- Backfill: anything already sitting in `ready` gets a clock so the sweep can
-- reason about it instead of leaving it on the board forever.
update public.orders
   set ready_at = coalesce(updated_at, created_at)
 where status = 'ready' and ready_at is null;

-- --------------------------------------------------------------------------
-- 2. Housekeeping sweep
--
-- Ready → completed after p_ready_minutes: the food has been handed over; the
-- cook should not have to acknowledge that. Orders stay in the table (analytics
-- still count them) — they just leave the board.
--
-- Abandoned UPI → cancelled after p_abandon_minutes: the customer opened the
-- Razorpay sheet and walked away. NEVER touches cash orders (those legitimately
-- wait for someone to reach the counter) and never touches anything paid.
-- --------------------------------------------------------------------------
create or replace function public.sweep_orders(
  p_ready_minutes   int default 10,
  p_abandon_minutes int default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set status = 'completed'
   where status = 'ready'
     and ready_at is not null
     and ready_at < now() - make_interval(mins => p_ready_minutes);

  update public.orders
     set status = 'cancelled'
   where status = 'pending_payment'
     and payment_status <> 'paid'
     and payment_method = 'upi'
     and created_at < now() - make_interval(mins => p_abandon_minutes);
end;
$$;

revoke all on function public.sweep_orders(int, int) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. Rate limiting
--
-- One row per bucket key (session id, or client IP for people with no session
-- yet). A fixed window that resets lazily on first hit after it expires.
-- The whole read-modify-write happens inside one statement, so two concurrent
-- requests can't both read the same count and slip past the limit.
-- --------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text        primary key,
  count        int         not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies at all: reachable only through the SECURITY DEFINER function below.

create or replace function public.bump_rate_limit(
  p_key             text,
  p_limit           int,
  p_window_seconds  int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
     set count = case
           when rl.window_start < now() - make_interval(secs => p_window_seconds)
             then 1
             else rl.count + 1
         end,
         window_start = case
           when rl.window_start < now() - make_interval(secs => p_window_seconds)
             then now()
             else rl.window_start
         end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.bump_rate_limit(text, int, int) from public, anon, authenticated;

-- Keeps the table from growing without bound; safe to call any time.
create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. Make sure the service role can actually call these.
--
-- 0004 revoked next_daily_order_number from public/anon/authenticated. That is
-- correct, but it relies on service_role holding its own grant — and if that
-- grant is missing, paid orders silently get no order number. Grant it here
-- explicitly so the failure mode can't happen.
-- --------------------------------------------------------------------------
grant execute on function public.next_daily_order_number()          to service_role;
grant execute on function public.sweep_orders(int, int)             to service_role;
grant execute on function public.bump_rate_limit(text, int, int)    to service_role;
grant execute on function public.prune_rate_limits()                to service_role;

-- ============================================================================
-- 0009_grants.sql  —  Night Canteen
--
-- Declares the table privileges the app needs, explicitly.
--
-- WHY THIS EXISTS
-- An RLS policy is a filter, not a grant. `create policy ... to anon` says
-- "of the rows anon may touch, these are visible" — it does NOT give anon the
-- right to touch the table at all. That still requires GRANT.
--
-- Migrations 0001–0008 never granted anything; they relied on Postgres default
-- privileges to hand out DML implicitly. That is a platform detail, not a
-- promise. On a database where tables are owned by `postgres`, the default ACL
-- gives anon/authenticated/service_role only TRUNCATE, REFERENCES and TRIGGER —
-- no SELECT, INSERT, UPDATE or DELETE — and every single query fails with
-- "permission denied for table". Not subtly: the customer menu returns an error.
--
-- Declaring the grants here makes the schema self-contained, so it behaves the
-- same on a local stack, a fresh Supabase project, or any other Postgres.
--
-- SAFE TO RUN ANYWHERE: GRANT is idempotent. On a database that already has
-- these privileges this migration changes nothing. It adds no tables, alters no
-- columns and touches no data.
--
-- Privileges below mirror the RLS policies exactly — nothing wider. RLS still
-- decides which rows are visible; these grants only make the tables reachable.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- service_role — the trusted server-side path (customer ordering, payments,
-- sweeps, rate limiting). Bypasses RLS, but still needs table privileges.
-- --------------------------------------------------------------------------
grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select on all sequences in schema public to service_role;

-- --------------------------------------------------------------------------
-- anon + authenticated — public read surfaces only.
-- Matches the "public read" policies in 0001, 0005 and 0006.
-- --------------------------------------------------------------------------
grant select on
    public.menu_categories,
    public.menu_items,
    public.menu_item_variants,
    public.store_settings
  to anon, authenticated;

-- --------------------------------------------------------------------------
-- authenticated (staff) — everything an admin policy already allows.
-- RLS still gates each of these behind public.is_admin().
-- --------------------------------------------------------------------------

-- Menu management (0002, 0006): "for all" policies.
grant insert, update, delete on
    public.menu_categories,
    public.menu_items,
    public.menu_item_variants
  to authenticated;

-- Store open/closed (0005): update only.
grant update on public.store_settings to authenticated;

-- Own profile / staff lookup (0002): read only.
grant select on public.admin_profiles to authenticated;

-- Audit trail (0002): append and read; never edited or deleted.
grant select, insert on public.audit_log to authenticated;

-- Order board (0003): read orders + items, advance order status.
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

-- NOTE: customer_sessions, daily_counters and rate_limits are deliberately
-- absent here. They have no RLS policies and are reached only through the
-- service role or a SECURITY DEFINER function.

-- --------------------------------------------------------------------------
-- Future tables inherit the same shape, so a later migration can't silently
-- reintroduce the problem this file fixes.
-- --------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- ============================================================================
-- seed.sql  —  Night Canteen live menu.
--
-- This is DATA, not configuration: once seeded, the menu is owned by the admin
-- UI. Add, rename, re-price, or mark items sold out from /admin/menu — never by
-- editing this file and re-running it. It exists to get a fresh database to the
-- correct starting state.
--
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, so re-running is a no-op and
-- will NOT clobber prices you've since changed in the admin UI.
--
-- Run in the Supabase SQL editor after the migrations (see SETUP.md).
-- Prices are INTEGER PAISE (₹1 = 100 paise).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clear the old dev sample menu, if this database ever had it. Only ever
-- touches the sample UUIDs shipped in earlier versions of this file — real
-- items created through the admin UI have random UUIDs and are untouched.
-- ---------------------------------------------------------------------------
delete from public.menu_items where id in (
  'a0000001-0000-0000-0000-000000000001','a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000003','a0000002-0000-0000-0000-000000000001',
  'a0000002-0000-0000-0000-000000000002','a0000003-0000-0000-0000-000000000001',
  'a0000003-0000-0000-0000-000000000002','a0000004-0000-0000-0000-000000000001',
  'a0000004-0000-0000-0000-000000000002','a0000004-0000-0000-0000-000000000003'
);
delete from public.menu_categories where id in (
  '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444'
);

-- ---------------------------------------------------------------------------
-- Categories — sort_order is the order they appear on the customer menu.
-- ---------------------------------------------------------------------------
insert into public.menu_categories (id, name, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', 'Beverages',    1),
  ('c1000000-0000-4000-8000-000000000002', 'Maggi',        2),
  ('c1000000-0000-4000-8000-000000000003', 'Sandwiches',   3),
  ('c1000000-0000-4000-8000-000000000004', 'Breads',       4),
  ('c1000000-0000-4000-8000-000000000005', 'Pizzas',       5),
  ('c1000000-0000-4000-8000-000000000006', 'Eggs',         6),
  ('c1000000-0000-4000-8000-000000000007', 'French Fries', 7)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Items. Descriptions are intentionally left NULL — add them from the admin UI
-- if you want them; inventing copy for someone else's food is a bad idea.
-- ---------------------------------------------------------------------------

-- Beverages ------------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Tea',             1000, true, 1),
  ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Coffee',          1500, true, 2),
  ('a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Hot Chocolate',   6000, true, 3),
  ('a1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'Bournvita',       5000, true, 4),
  ('a1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'Cold Coffee',     5000, true, 5),
  ('a1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000001', 'Cold Bournvita',  5000, true, 6),
  ('a1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000001', 'Lassi',           3000, true, 7),
  ('a1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000001', 'Masala Chaas',    1500, true, 8),
  ('a1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000001', 'Oreo Shake',      6000, true, 9)
on conflict (id) do nothing;

-- Maggi ----------------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'Plain Maggi',              5000, true, 1),
  ('a2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'Masala Maggi',             6000, true, 2),
  ('a2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', 'Cheese Masala Maggi',      7000, true, 3),
  ('a2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000002', 'Egg Masala Cheese Maggi',  8000, true, 4)
on conflict (id) do nothing;

-- Sandwiches -----------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'Veg Sandwich',                    4000, true, 1),
  ('a3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'Veg Grilled Sandwich',            5000, true, 2),
  ('a3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Cheese Grilled Sandwich',         6000, true, 3),
  ('a3000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000003', 'Veg Cheese Grilled Sandwich',     7000, true, 4),
  ('a3000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000003', 'Chicken Grilled Sandwich',        8000, true, 5),
  ('a3000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000003', 'Chicken Cheese Grilled Sandwich', 10000, true, 6)
on conflict (id) do nothing;

-- Breads ---------------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004', 'Cheese Garlic Bread', 8000, true, 1),
  ('a4000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004', 'Cheese Chilli Toast', 8000, true, 2)
on conflict (id) do nothing;

-- Pizzas ---------------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a5000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000005', 'Margherita Cheese Pizza', 14900, true, 1),
  ('a5000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000005', 'Veg Cheese Pizza',        17900, true, 2),
  ('a5000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000005', 'Chicken Cheese Pizza',    19900, true, 3)
on conflict (id) do nothing;

-- Eggs -----------------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000006', 'Plain Omelette',  5000, true, 1),
  ('a6000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000006', 'Masala Omelette', 5000, true, 2),
  ('a6000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000006', 'Half Fry',        5000, true, 3),
  ('a6000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000006', 'Cheese Omelette', 8000, true, 4),
  ('a6000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000006', 'Egg Bhurji',      6000, true, 5),
  ('a6000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000006', 'Paneer Bhurji',   8000, true, 6)
on conflict (id) do nothing;

-- French Fries ---------------------------------------------------------------
insert into public.menu_items (id, category_id, name, price_paise, is_available, sort_order) values
  ('a7000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000007', 'French Fries',      6000, true, 1),
  ('a7000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000007', 'Peri Peri Fries',   7000, true, 2),
  ('a7000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000007', 'Cheese Fries',     10000, true, 3)
on conflict (id) do nothing;
