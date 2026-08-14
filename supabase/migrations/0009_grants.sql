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
