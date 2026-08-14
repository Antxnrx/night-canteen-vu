#!/usr/bin/env node
/**
 * Regenerates `supabase/setup.sql` — every migration plus the seed, in order,
 * as one file to paste into the Supabase SQL editor.
 *
 * It exists because the hand-maintained version drifted: it had stopped at
 * migration 0007 and still carried the old sample menu, so anyone following
 * SETUP.md would have got a database missing the sweep, the rate limiter, and
 * the real menu. Generating it removes that whole class of mistake.
 *
 *   node scripts/build-setup-sql.mjs
 *
 * Re-run after adding a migration.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const SEED = "supabase/seed.sql";
const OUT = "supabase/setup.sql";

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (migrations.length === 0) {
  console.error("No migrations found — is the path right?");
  process.exit(1);
}

const rule = "=".repeat(76);
const parts = [
  `-- ${rule}`,
  "-- setup.sql — GENERATED FILE. Do not edit by hand.",
  "--",
  "-- Every migration plus the seed, concatenated in order. Paste the whole file",
  "-- into the Supabase SQL editor and run it once. Safe to re-run: every",
  "-- statement is idempotent.",
  "--",
  "-- Regenerate with:  node scripts/build-setup-sql.mjs",
  `-- Contains: ${migrations.join(", ")}, seed.sql`,
  `-- ${rule}`,
  "",
];

for (const file of migrations) {
  parts.push(readFileSync(join(MIGRATIONS_DIR, file), "utf8").trimEnd(), "");
}
parts.push(readFileSync(SEED, "utf8").trimEnd(), "");

writeFileSync(OUT, parts.join("\n"));

console.log(`✓ ${OUT}`);
console.log(`  ${migrations.length} migrations + seed → ${parts.join("\n").split("\n").length} lines`);
for (const m of migrations) console.log(`    · ${m}`);
