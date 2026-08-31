# Night Canteen Setup

## Environment

Create `.env.local` from `.env.example` and set:

```bash
MONGODB_URI=<your MongoDB Atlas connection string>
MONGODB_DB_NAME=night_canteen
ADMIN_USERNAME=<initial staff username>
ADMIN_PASSWORD=<initial staff password>
ADMIN_EMAIL_DOMAIN=nightcanteen.local
CASHFREE_ENV=sandbox
```

`MONGODB_URI`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` are server-only values.
Never prefix them with `NEXT_PUBLIC_`.

On first boot, if no staff profile exists, the app creates an owner account from
`ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Admin login is at http://localhost:3000/admin/login.

## Staff Accounts

To create or reset a staff account:

```bash
ADMIN_PASSWORD='<new password>' node scripts/create-admin.mjs <username> "Display Name" owner
```

Roles are `owner` or `staff`.

## Data Model

MongoDB collections used by the app:

- `admin_users`
- `admin_profiles`
- `admin_sessions`
- `menu_categories`
- `menu_items`
- `menu_item_variants`
- `customer_sessions`
- `orders`
- `order_items`
- `store_settings`
- `rate_limits`
- `audit_log`
- `counters`

The app creates indexes and default `store_settings` automatically at startup.
