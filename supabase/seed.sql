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
