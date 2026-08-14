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
