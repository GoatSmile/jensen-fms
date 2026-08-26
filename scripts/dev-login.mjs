#!/usr/bin/env node
/**
 * Plant a session cookie in a REAL BROWSER, so an agent (or a human) can drive
 * the gated app without anyone typing a password into the login form.
 *
 *   node scripts/dev-login.mjs                 # Admin, land on /
 *   node scripts/dev-login.mjs "Lars" /work    # a person + a deep link
 *
 * Prints one URL. Open it in the browser under test; it Set-Cookies the
 * session and 302s to the target path, then the server exits.
 *
 * WHY A SECOND PORT: `fms_auth` is httpOnly, so `document.cookie` can't plant
 * it from a devtools console. Cookies are scoped by HOST and ignore PORT, so a
 * throwaway server on localhost:3999 can set a cookie that localhost:3000
 * sends right back. No app code is touched and the gate stays ON — which is
 * where the /logout prefetch bug was visible and gate-off testing was not.
 *
 * Local only: it needs SITE_PASSWORD to sign, and refuses a non-local target.
 */
import { createServer } from "node:http";

import { loadEnv, mintCookie } from "./lib/dev-session.mjs";

const args = process.argv.slice(2);
const who = args.find((a) => !a.startsWith("/")) ?? null;
const dest = args.find((a) => a.startsWith("/")) ?? "/";
const PORT = Number(process.env.DEV_LOGIN_PORT ?? 3999);
const APP = process.env.DEV_LOGIN_APP ?? "http://localhost:3000";

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) {
  console.error(`Refusing to plant a session cookie for ${APP} — local only.`);
  process.exit(1);
}

const env = await loadEnv();
const result = await mintCookie(env, who);
if (!result) {
  console.error("SITE_PASSWORD is not set — the gate is off, no cookie needed.");
  process.exit(1);
}

const server = createServer((req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${result.cookie}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`,
  );
  res.writeHead(302, { Location: `${APP}${dest}` });
  res.end();
  // One shot: the cookie is planted, nothing should keep this port open.
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`# session for ${result.person.full_name} → ${APP}${dest}`);
  process.stdout.write(`http://localhost:${PORT}/\n`);
});
