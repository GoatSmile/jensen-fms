#!/usr/bin/env node
/**
 * Route smoke sweep — the check the toolchain cannot do.
 *
 * `tsc`, `eslint` and `next build` all pass on the failure class that has bitten
 * this project repeatedly: a server component importing a VALUE from a
 * `"use client"` module, a token used at the wrong level, a missing i18n key, a
 * handler that throws on a path nobody clicked. The only way to catch those is
 * to fetch the route and look at what comes back.
 *
 * Read-only. It GETs pages and queries the DB for real ids; it writes nothing.
 *
 *   node scripts/smoke-routes.mjs                 # against http://localhost:3000
 *   BASE=http://localhost:3001 node scripts/…     # elsewhere
 *   node scripts/smoke-routes.mjs --only /parts   # substring filter
 *
 * Requires a dev server already running (`npm run dev`) and `.env.local` for
 * the Supabase credentials used to resolve `[id]` segments.
 */

import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");
const BASE = process.env.BASE ?? "http://localhost:3000";
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

/* ------------------------------------------------------------------ env ---- */

async function loadEnv() {
  const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/* ------------------------------------------------------------- discovery --- */

/** Every `page.tsx` under src/app, as a route pattern with `[param]` intact. */
function discoverRoutes(dir = APP_DIR, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Private folders (_actions, _components) hold no routes.
      if (entry.startsWith("_")) continue;
      out.push(...discoverRoutes(full, `${prefix}/${entry}`));
    } else if (entry === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix);
    }
  }
  return out;
}

/* ------------------------------------------------------------ param ids ---- */

/**
 * Which table backs the `[id]` in a route, by longest matching prefix. The
 * dynamic segment is always an id in the collection named by its parent path.
 */
const PREFIX_TABLE = [
  ["/admin/people/roles", "roles"],
  ["/admin/categories", "part_categories"],
  ["/admin/colors", "colors"],
  ["/admin/customer-segments", "customer_segments"],
  ["/admin/families", "bike_families"],
  ["/admin/hs-codes", "hs_codes"],
  ["/admin/locations", "inventory_locations"],
  ["/admin/suppliers", "suppliers"],
  ["/admin/kits", "kits"],
  ["/admin/people", "people"],
  ["/bike-templates", "bike_templates"],
  ["/maintenance/tickets", "maintenance_tickets"],
  ["/maintenance/work-orders", "work_orders"],
  ["/manufacturing-orders", "manufacturing_orders"],
  ["/organizations", "organizations"],
  ["/paint-orders", "service_orders"],
  ["/purchase-orders", "purchase_orders"],
  ["/sales-orders", "sales_orders"],
  ["/service-agreements", "service_agreements"],
  ["/invoices", "invoices"],
  ["/bikes", "bikes"],
  ["/parts", "parts"],
  ["/inbox", "inbound_messages"],
  ["/work", "work_orders"],
  ["/qr", "bikes"],
  ["/b", "bikes"],
]
  // Longest first so /admin/people/roles wins over /admin/people.
  .sort((a, b) => b[0].length - a[0].length);

function tableFor(route) {
  const stem = route.slice(0, route.indexOf("["));
  const hit = PREFIX_TABLE.find(([p]) => stem === `${p}/` || stem.startsWith(`${p}/`));
  return hit?.[1] ?? null;
}

class Db {
  constructor(env) {
    this.url = env.NEXT_PUBLIC_SUPABASE_URL;
    this.key = env.SUPABASE_SECRET_KEY;
    this.cache = new Map();
  }

  async get(pathAndQuery) {
    const res = await fetch(`${this.url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }

  /** One live (non-soft-deleted) id from a table, cached. */
  async sampleId(table) {
    if (this.cache.has(table)) return this.cache.get(table);
    let id = null;
    for (const q of [
      `${table}?select=id&deleted_at=is.null&limit=1`,
      `${table}?select=id&limit=1`, // table has no deleted_at
    ]) {
      try {
        const rows = await this.get(q);
        id = rows[0]?.id ?? null;
        break;
      } catch {
        /* try the next shape */
      }
    }
    this.cache.set(table, id);
    return id;
  }

  /** An MO that actually has a bike on it — the build route needs the pair. */
  async moBikePair() {
    if (this.cache.has("__pair")) return this.cache.get("__pair");
    const rows = await this.get(
      "bikes?select=id,manufacturing_order_id&manufacturing_order_id=not.is.null&deleted_at=is.null&limit=1",
    );
    const pair = rows[0]
      ? { id: rows[0].manufacturing_order_id, bikeId: rows[0].id }
      : null;
    this.cache.set("__pair", pair);
    return pair;
  }
}

/**
 * Turn a route pattern into concrete URLs. Returns [] when the data needed to
 * reach it does not exist — reported as SKIP, not as a pass.
 */
async function expand(route, db) {
  // /admin/lists renders eight different vocabularies off one page; each
  // descriptor is its own render path, so each is its own test.
  if (route === "/admin/lists") {
    const vocabs = [
      "categories",
      "colors",
      "coatings",
      "segments",
      "families",
      "hs-codes",
      "locations",
      "service-part-types",
    ];
    return [route, ...vocabs.map((v) => `${route}?vocab=${v}`)];
  }

  if (!route.includes("[")) return [route];

  const params = [...route.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);

  if (params.length === 2) {
    const pair = await db.moBikePair();
    if (!pair) return [];
    return [route.replace("[id]", pair.id).replace("[bikeId]", pair.bikeId)];
  }

  const table = tableFor(route);
  if (!table) return [];
  const id = await db.sampleId(table);
  if (!id) return [];
  return [route.replace(/\[\w+\]/, id)];
}

/* ---------------------------------------------------------- diagnosis ------ */

/**
 * Markers of a page that returned 200 while being broken. Next's dev overlay
 * ships inside a 200 in some cases, and a caught server error renders a digest.
 */
const BODY_FAILURES = [
  ["nextjs dev overlay", /__next_error__|nextjs__container_errors/i],
  ["server exception", /Application error: a server-side exception/i],
  ["unhandled runtime error", /Unhandled Runtime Error/i],
  ["react hydration", /Hydration failed|did not match/i],
];

/**
 * A missing i18n key is checked against the RENDERED text, never the raw HTML:
 * next-intl embeds the whole message dictionary in a script tag, so a raw grep
 * reports a false positive for any key that merely exists (STATUS landmine).
 */
function bodyHasMissingMessage(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  return /MISSING_MESSAGE|IntlError/.test(withoutScripts);
}

/* ---------------------------------------------------------------- main ----- */

const results = [];

function record(url, status, verdict, note) {
  results.push({ url, status, verdict, note });
  const tag =
    verdict === "pass"
      ? "\x1b[32mPASS\x1b[0m"
      : verdict === "skip"
        ? "\x1b[90mSKIP\x1b[0m"
        : verdict === "redirect"
          ? "\x1b[36mREDIR\x1b[0m"
          : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag} ${String(status).padEnd(3)} ${url}${note ? `  — ${note}` : ""}`);
}

async function main() {
  const env = await loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(2);
  }
  const db = new Db(env);

  try {
    await fetch(BASE, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`No server at ${BASE} — start one with \`npm run dev\`.`);
    process.exit(2);
  }

  let routes = discoverRoutes().sort();
  if (ONLY) routes = routes.filter((r) => r.includes(ONLY));
  console.log(`Sweeping ${routes.length} route patterns against ${BASE}\n`);

  for (const route of routes) {
    let urls;
    try {
      urls = await expand(route, db);
    } catch (err) {
      record(route, "—", "fail", `id lookup threw: ${err.message}`);
      continue;
    }
    if (urls.length === 0) {
      record(route, "—", "skip", "no row exists to render it");
      continue;
    }

    for (const url of urls) {
      let res;
      try {
        res = await fetch(`${BASE}${url}`, { redirect: "manual" });
      } catch (err) {
        record(url, "—", "fail", `fetch threw: ${err.message}`);
        continue;
      }

      if (res.status >= 300 && res.status < 400) {
        record(url, res.status, "redirect", `→ ${res.headers.get("location")}`);
        continue;
      }
      if (res.status >= 400) {
        record(url, res.status, "fail", "non-OK status");
        continue;
      }

      const html = await res.text();
      const hit = BODY_FAILURES.find(([, re]) => re.test(html));
      if (hit) {
        record(url, res.status, "fail", hit[0]);
        continue;
      }
      if (bodyHasMissingMessage(html)) {
        record(url, res.status, "fail", "missing i18n message in rendered text");
        continue;
      }
      record(url, res.status, "pass");
    }
  }

  const by = (v) => results.filter((r) => r.verdict === v);
  console.log(
    `\n${by("pass").length} pass · ${by("redirect").length} redirect · ` +
      `${by("skip").length} skip · ${by("fail").length} fail`,
  );

  if (by("skip").length) {
    console.log("\nSkipped (no data to render — not a pass):");
    for (const r of by("skip")) console.log(`  ${r.url}`);
  }
  if (by("fail").length) {
    console.log("\nFailures:");
    for (const r of by("fail")) console.log(`  ${r.status} ${r.url} — ${r.note}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
