#!/usr/bin/env node
/**
 * Schema-drift check — is the database actually at the migration the code expects?
 *
 * THE FAILURE THIS EXISTS FOR. Code deploys itself (push-to-`main` → Vercel);
 * schema is applied by hand. The two halves diverge silently, and on 2026-09-04
 * they did: migrations 98 and 99 were never applied, so `/offers` threw a 500 in
 * production for every visitor from the day it shipped. Every existing check ran
 * on the wrong side of the divergence — `tsc` reads a hand-patched types file,
 * `npm run smoke` hits the dev server (the LOCAL copy), and "the route answers
 * 307 → /login" redirects in middleware before any query runs.
 *
 * This diffs `migrations/*.sql` against `public.schema_migrations` (migration
 * 101), which every migration writes its own row into, and names exactly what is
 * missing. Read-only: it runs one SELECT and writes nothing.
 *
 *   npm run check:prod                 # against PRODUCTION (the linked project)
 *   node scripts/check-prod-schema.mjs --local     # against the local copy
 *
 * Reaches production with `supabase db query --linked`, which goes through the
 * Management API on the CLI token in the keychain — no DB password, and it works
 * when the MCP does not. That instrument's absence is what let 98/99 through.
 *
 * Exit 0 = in sync. Exit 1 = drift, and the push that would ship it should not
 * happen (`.claude/hooks/prod-schema-gate.sh` enforces that on `git push`).
 */

import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "migrations");
const LOCAL = process.argv.includes("--local");
const TARGET = LOCAL ? "--local" : "--linked";
/** Sentence-initial and mid-sentence forms, so the messages read as English. */
const LABEL = LOCAL ? "The local copy" : "PRODUCTION";
const label = LOCAL ? "the local copy" : "production";

/* ------------------------------------------------------------------ disk ---- */

/** Every `NN_name.sql` in migrations/, oldest first. */
function migrationsOnDisk() {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .map((f) => ({
      version: Number(f.match(/^(\d+)/)[1]),
      name: f.replace(/\.sql$/, ""),
    }))
    .sort((a, b) => a.version - b.version);
}

/* --------------------------------------------------------------- database ---- */

function query(sql) {
  const out = execFileSync("supabase", ["db", "query", TARGET, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // stdout is a bare JSON object; the CLI's update notice goes to stderr.
  return JSON.parse(out).rows ?? [];
}

/** Applied versions, or a diagnosis of why we could not read them. */
function appliedVersions() {
  try {
    const rows = query(
      "select version from public.schema_migrations order by version;",
    );
    return { ok: true, versions: new Set(rows.map((r) => Number(r.version))) };
  } catch (err) {
    const detail = `${err.stderr ?? ""}${err.stdout ?? ""}${err.message ?? ""}`;
    if (/schema_migrations|does not exist|42P01/i.test(detail)) {
      return {
        ok: false,
        reason:
          `The ledger itself is missing from ${label}.\n` +
          `Apply it first:\n\n` +
          `  supabase db query ${TARGET} -f migrations/101_schema_ledger.sql`,
      };
    }
    return {
      ok: false,
      reason:
        `Could not read the ledger from ${label}.\n\n` +
        `${detail.trim().split("\n").slice(0, 8).join("\n")}\n\n` +
        `If this is an auth failure, run \`supabase login\` (the token lives in ` +
        `the keychain) and confirm the project is linked with ` +
        `\`supabase projects list\`.`,
    };
  }
}

/* ------------------------------------------------------------------ main ---- */

const disk = migrationsOnDisk();
if (disk.length === 0) {
  console.error("No migrations found in migrations/ — wrong directory?");
  process.exit(1);
}

const applied = appliedVersions();
if (!applied.ok) {
  console.error(`\n✗ Schema check could not run.\n\n${applied.reason}\n`);
  process.exit(1);
}

const missing = disk.filter((m) => !applied.versions.has(m.version));
const diskVersions = new Set(disk.map((m) => m.version));
const unknown = [...applied.versions].filter((v) => !diskVersions.has(v));

if (unknown.length > 0) {
  // The database is AHEAD of the repo: a migration ran that no file describes.
  // Not fatal — it usually means a file was applied and then renamed or removed
  // — but it means /migrations has stopped being the source of truth.
  console.warn(
    `⚠ ${LABEL} reports ${unknown.length} migration(s) with no file in ` +
      `migrations/: ${unknown.join(", ")}`,
  );
}

if (missing.length === 0) {
  const latest = disk[disk.length - 1];
  console.log(
    `✓ ${LABEL} is at migration ${latest.version} (${latest.name}) — ` +
      `all ${disk.length} applied.`,
  );
  process.exit(0);
}

console.error(
  `\n✗ ${LABEL} is BEHIND the repo — ${missing.length} migration(s) not applied:\n`,
);
for (const m of missing) console.error(`    ${m.name}.sql`);
console.error(
  `\nApply them before pushing code that reads the new columns:\n\n` +
    missing
      .map((m) => `  supabase db query ${TARGET} -f migrations/${m.name}.sql`)
      .join("\n") +
    `\n\nThen re-run this check. Applying to one database is not enough — ` +
    `production and the local copy both need every migration.\n`,
);
process.exit(1);
