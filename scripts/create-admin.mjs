#!/usr/bin/env node
/**
 * Creates or updates a MongoDB-backed Night Canteen staff account.
 *
 * Usage:
 *   read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
 *   node scripts/create-admin.mjs nightcanteen006969 "Night Canteen" owner
 */

import { readFileSync } from "node:fs";
import { randomUUID, scryptSync } from "node:crypto";
import { MongoClient } from "mongodb";

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
    // No .env.local; use exported environment.
  }
}

function die(message) {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

function passwordHash(password, salt = randomUUID()) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

loadEnv();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? "night_canteen";
const password = process.env.ADMIN_PASSWORD;
const username = (process.argv[2] ?? process.env.ADMIN_USERNAME ?? "")
  .trim()
  .toLowerCase();
const displayName = process.argv[3] ?? username;
const role = process.argv[4] ?? "owner";
const domain = process.env.ADMIN_EMAIL_DOMAIN ?? "nightcanteen.local";
const email = username.includes("@") ? username : `${username}@${domain}`;

if (!uri) die("MONGODB_URI must be set in .env.local or the environment.");
if (!username)
  die("Usage: node scripts/create-admin.mjs <username> [displayName] [owner|staff]");
if (!password) die("Set ADMIN_PASSWORD in the environment or .env.local.");
if (password.length < 12) die("Use a password of at least 12 characters.");
if (!["owner", "staff"].includes(role))
  die(`Role must be 'owner' or 'staff' (got '${role}').`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const existing = await db.collection("admin_users").findOne({ email });
const userId = existing?.id ?? randomUUID();
const stamp = new Date().toISOString();

await db.collection("admin_users").updateOne(
  { email },
  {
    $set: {
      id: userId,
      email,
      password_hash: passwordHash(password),
      updated_at: stamp,
    },
    $setOnInsert: { created_at: stamp },
  },
  { upsert: true },
);

await db.collection("admin_profiles").updateOne(
  { user_id: userId },
  {
    $set: { user_id: userId, display_name: displayName, role, updated_at: stamp },
    $setOnInsert: { created_at: stamp },
  },
  { upsert: true },
);

await client.close();

console.log("\n  Night Canteen staff account ready");
console.log(`  username : ${username}`);
console.log(`  email    : ${email}`);
console.log(`  role     : ${role}`);
console.log(`  database : ${dbName}\n`);
