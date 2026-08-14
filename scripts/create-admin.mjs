#!/usr/bin/env node
/**
 * Creates (or updates) a Night Canteen staff account.
 *
 * Two things have to exist for a staff login to work, and creating only the
 * first is the classic mistake:
 *   1. a Supabase Auth user
 *   2. a matching row in `admin_profiles`
 * An auth user without the profile row can sign in and then dead-ends on
 * "Not authorized". This script always does both.
 *
 * Safe to re-run: an existing account has its password reset to the one given
 * rather than erroring, which is also how you recover a forgotten password.
 *
 * Usage — the password is read from the environment so it never lands in the
 * repo or in your shell history file:
 *
 *   read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
 *   node scripts/create-admin.mjs nightcanteen006969
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Minimal .env.local reader — avoids a dependency just for this. */
function loadEnv(path = ".env.local") {
  try {
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env.local — fall back to whatever is already exported.
  }
}

function die(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_PASSWORD;

const username = (process.argv[2] ?? "").trim().toLowerCase();
const displayName = process.argv[3] ?? "Night Canteen";
const role = process.argv[4] ?? "owner"; // 'owner' | 'staff'

if (!url || !serviceKey) {
  die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
}
if (!username) {
  die("Usage: node scripts/create-admin.mjs <username> [displayName] [owner|staff]");
}
if (!password) {
  die("Set ADMIN_PASSWORD in the environment. Never pass a password as an argument — it lands in your shell history.");
}
if (password.length < 12) {
  die("Use a password of at least 12 characters.");
}
if (!["owner", "staff"].includes(role)) {
  die(`Role must be 'owner' or 'staff' (got '${role}').`);
}

// Must match src/lib/admin-identity.ts — staff type a username, Supabase Auth
// stores an email.
const domain = process.env.ADMIN_EMAIL_DOMAIN ?? "nightcanteen.local";
const email = username.includes("@") ? username : `${username}@${domain}`;

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Finds an existing auth user by email, paging until found or exhausted. */
async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) die(`Could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

console.log(`\n  Night Canteen — staff account\n`);
console.log(`  username : ${username}`);
console.log(`  email    : ${email}   (internal; never receives mail)`);
console.log(`  role     : ${role}`);
console.log(`  target   : ${url}\n`);

const existing = await findUserByEmail(email);
let userId;

if (existing) {
  userId = existing.id;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) die(`Could not update the password: ${error.message}`);
  console.log("  ✓ auth user already existed — password reset");
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no inbox exists for this address
  });
  if (error) die(`Could not create the auth user: ${error.message}`);
  userId = data.user.id;
  console.log("  ✓ auth user created");
}

// The half everyone forgets.
const { error: profileError } = await supabase
  .from("admin_profiles")
  .upsert(
    { user_id: userId, display_name: displayName, role },
    { onConflict: "user_id" },
  );
if (profileError) {
  die(
    `Auth user is ready but the admin_profiles row failed: ${profileError.message}\n` +
      `    Without it this account signs in and dead-ends on "Not authorized".`,
  );
}
console.log("  ✓ admin_profiles row upserted");

console.log(`\n  Done. Sign in at /admin/login with the username "${username}".\n`);
