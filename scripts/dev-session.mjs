#!/usr/bin/env node
/**
 * Print a valid `fms_auth` cookie for a person, for local testing.
 *
 *   node scripts/dev-session.mjs                    # Admin
 *   node scripts/dev-session.mjs "Lars"             # name fragment
 *   node scripts/dev-session.mjs <person-uuid>
 *   node scripts/dev-session.mjs "Lars" --curl      # a ready -b flag
 *   node scripts/dev-session.mjs "Lars" --all-caps  # ignore role limits
 *
 * Mints for ANY person, including ones the login screen would refuse (no
 * password, no roles). That is the point: the mechanic who never logs in is
 * exactly who attribution needs to be tested with.
 *
 * Local only in practice — it needs SITE_PASSWORD, and if the gate is off it
 * says so and prints nothing.
 */
import { loadEnv, mintCookie } from "./lib/dev-session.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const who = args.find((a) => !a.startsWith("--")) ?? null;

const env = await loadEnv();
const result = await mintCookie(env, who, { allCaps: flags.has("--all-caps") });

if (!result) {
  console.error("SITE_PASSWORD is not set — the gate is off, no cookie needed.");
  process.exit(1);
}

const { person, cookie } = result;
if (flags.has("--curl")) {
  process.stdout.write(`-b '${cookie}'\n`);
} else {
  console.error(`# session for ${person.full_name} (${person.id})`);
  process.stdout.write(`${cookie}\n`);
}
