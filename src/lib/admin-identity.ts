/**
 * Staff sign in with a username, not an email.
 *
 * Supabase Auth keys accounts on email, so a username is mapped onto a stable
 * internal address: `nightcanteen006969` → `nightcanteen006969@<domain>`. The
 * domain is never sent mail and doesn't need to be a domain anyone owns — it
 * exists only to satisfy the auth provider's format.
 *
 * Anyone who types a full email still gets it used verbatim, so accounts that
 * were created with a real address keep working.
 *
 * Kept in its own module so `scripts/create-admin.mjs` and the login action can
 * never disagree about what an account is called.
 */

export const ADMIN_EMAIL_DOMAIN =
  process.env.ADMIN_EMAIL_DOMAIN ?? "nightcanteen.local";

/** Username or email → the email Supabase Auth actually stores. */
export function toAdminEmail(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value) return "";
  return value.includes("@") ? value : `${value}@${ADMIN_EMAIL_DOMAIN}`;
}

/** Usernames are deliberately boring: letters, digits, dot, dash, underscore. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/i;

/** True if the input is a plausible username or email. */
export function isValidIdentifier(input: string): boolean {
  const value = input.trim();
  if (!value || value.length > 254) return false;
  if (value.includes("@")) return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
  return USERNAME_PATTERN.test(value);
}
