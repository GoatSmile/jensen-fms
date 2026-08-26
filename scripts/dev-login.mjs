#!/usr/bin/env node
/**
 * Plant a session cookie in a REAL BROWSER, so an agent (or a human) can drive
 * the gated app without anyone typing a password into the login form.
 *
 *   node scripts/dev-login.mjs                 # Admin, land on /
 *   node scripts/dev-login.mjs "Lars" /work    # a person + a deep link
 *
 * Prints one URL. Open it in the browser under test; it Set-Cookies the
 * session and 302s to the target path. Where the browser tool refuses to
 * navigate to an unregistered port, fetch it from a page already on the app
 * instead — the cookie lands the same way, which is what the CORS headers and
 * the OPTIONS branch below are for:
 *
 *     await fetch("http://localhost:3999/", { credentials: "include" });
 *     location.reload();
 * The server stays up for a short window
 * (--wait seconds, default 120) rather than closing on the first hit: browsers
 * fire favicon and preload requests too, and a one-shot server gets consumed by
 * one of those before the real navigation lands.
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
// A person is the only bare argument: "/path" is the destination and "--x"
// is a flag. Without the flag test, `--wait=600` was read as a person name.
const who =
  args.find((a) => !a.startsWith("/") && !a.startsWith("--")) ?? null;
const dest = args.find((a) => a.startsWith("/")) ?? "/";
const PORT = Number(process.env.DEV_LOGIN_PORT ?? 3999);
const waitArg = args.find((a) => a.startsWith("--wait="));
const WAIT_MS = (waitArg ? Number(waitArg.split("=")[1]) : 120) * 1000;
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
  // CORS for the fetch route below. Credentialed CORS forbids "*", so the
  // origin is echoed — and only ever a localhost one, because APP is checked
  // against a localhost pattern above before this server is created.
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader(
    "Set-Cookie",
    `${result.cookie}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`,
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(302, { Location: `${APP}${dest}` });
  res.end();
});

// Bounded lifetime: long enough to drive a browser to it, short enough that a
// forgotten one does not sit holding a port that plants sessions.
const stop = setTimeout(() => server.close(), WAIT_MS);
stop.unref?.();

server.listen(PORT, "127.0.0.1", () => {
  console.error(
    `# session for ${result.person.full_name} → ${APP}${dest} ` +
      `(open within ${Math.round(WAIT_MS / 1000)}s)`,
  );
  process.stdout.write(`http://localhost:${PORT}/\n`);
});
