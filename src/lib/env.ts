/**
 * Central access point for environment variables.
 *
 * Only `NEXT_PUBLIC_`-prefixed vars are exposed to the browser; everything else
 * (service role key, Cashfree secrets) stays server-side only.
 */
export const env = {
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "night_canteen",
  adminUsername: process.env.ADMIN_USERNAME ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  // Cashfree Payments. The secret key doubles as the webhook signing key, so
  // it must never reach the browser.
  cashfreeAppId: process.env.CASHFREE_APP_ID ?? "",
  cashfreeSecretKey: process.env.CASHFREE_SECRET_KEY ?? "",
  // "sandbox" | "production". Defaults to sandbox so a missing value can never
  // silently start charging real cards.
  cashfreeEnv: (process.env.CASHFREE_ENV ?? "sandbox") as
    | "sandbox"
    | "production",
} as const;

/** True once the MongoDB connection string is present. */
export function isMongoConfigured(): boolean {
  return Boolean(env.mongodbUri);
}

/** True once Cashfree server keys are present (needed to take payments). */
export function isCashfreeConfigured(): boolean {
  return Boolean(env.cashfreeAppId && env.cashfreeSecretKey);
}
