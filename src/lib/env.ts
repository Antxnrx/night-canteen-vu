/**
 * Central access point for environment variables.
 *
 * Only `NEXT_PUBLIC_`-prefixed vars are exposed to the browser; everything else
 * (service role key, Cashfree secrets) stays server-side only.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  // Server-only. Never import these into a client component.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
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

/** True once the public Supabase URL + anon key are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** True once Cashfree server keys are present (needed to take payments). */
export function isCashfreeConfigured(): boolean {
  return Boolean(env.cashfreeAppId && env.cashfreeSecretKey);
}
