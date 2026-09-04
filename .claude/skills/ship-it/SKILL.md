---
name: ship-it
description: Close out a piece of finished work on this project — run the gates, browser-verify, then reduce-don't-grow across the docs (STATUS overwrite, DECISIONS entry, BACKLOG deletion, closed plans to archive), log it, and commit. Use when work is complete and ready to land, or when the user says "ship it", "let's commit this", "wrap up", or "session end".
---

# Ship it

The doctrine is **reduce, don't grow**. Finishing work means *less* documentation
weight, not more: STATUS gets rewritten rather than appended, a shipped BACKLOG
entry is deleted rather than ticked, a closed plan moves to `docs/archive/`, and
only durable residue reaches `CLAUDE.md`.

Work through this in order. Skip a step only when it genuinely does not apply, and
say which you skipped.

## 1. Gates

```bash
npx tsc --noEmit && npm run build
```

`.claude/hooks/gates.sh` enforces this at commit time, but run it yourself first so
a failure surfaces while you still have context. There are no unit tests — the
Vitest/CI item sits parked in `docs/BACKLOG.md` — but `npm run smoke` sweeps every
route (dev server running); run it. Both facts are why step 2 is not optional.

**Never run `npm run build` while the dev server is live** — it corrupts `.next` and
produces phantom hydration stalls. Stop the server first.

## 2. Browser-verify — this is the real gate

`tsc` and `next build` are **necessary but not sufficient**: they miss RSC boundary
violations and other runtime-only failures (the lesson of commit `fa1dbed`, a server
component calling a `"use client"` function). Until CI exists, manually smoke-test
every route you touched.

Also check:

- **en/da parity** if you touched any user-facing string. Both locales.
- **Which database?** Verify against the LOCAL copy (`scripts/use-db.sh`, green
  banner). The Supabase MCP tools are bound to PRODUCTION whatever the app points
  at — confirm local writes with `psql` against `127.0.0.1:54322`.
- The preview pane **throttles hydration while hidden** — front it before
  click-testing, or you will diagnose a stall that isn't there.
- A **stale PWA service worker** can serve an old shell mid-session. A fresh tab or
  an SW-unregister clears it.

## 3. Rewrite `docs/STATUS.md` — overwrite, never append

**Replace** the affected lines; a new session must resume from `CLAUDE.md` +
STATUS.md alone. That includes the header — what shipped in earlier sessions goes to
`docs/archive/HISTORY.md` and `docs/WORKLOG.md`, not into a growing "Previously…"
parenthetical.

Update **In flight / next action**, and re-check **Landmines** and **Data-entry
debts**: a resolved landmine left standing costs a future session real time.

## 4. Was a decision locked? → `docs/DECISIONS.md`, same commit

Append-only, dated, **supersede rather than edit**. What was decided, why, and what
was rejected. See the `log-decision` skill.

## 5. Did this ship a BACKLOG item, or close a plan?

- `docs/BACKLOG.md` entries are **deleted** when they ship or are rejected, not
  ticked.
- A finished `docs/plan-*.md` is **marked closed and moved to `docs/archive/`**, and
  every reference to it repointed. A shipped plan left in `docs/` makes the whole
  directory ambiguous about what is still live.
- **Did this add a migration?** Apply it to BOTH databases — production BEFORE
  the push that deploys code reading the new columns — and hand-patch
  `src/lib/types/database.ts` (Row + Insert + Update): `supabase gen types
  typescript --local` does not reproduce the committed file.

  **End every migration with its own ledger insert**, or the checker below will
  keep reporting it missing:

  ```sql
  insert into public.schema_migrations (version, name)
    values (NNN, 'NNN_name') on conflict (version) do nothing;
  ```

  Apply with `supabase db query --linked -f migrations/NNN_name.sql` (production)
  and `--local` (the copy), then prove it landed:

  ```bash
  npm run check:prod && npm run check:local
  ```

  **Neither an owner's report nor a route answering `307 → /login` is
  verification** — that redirect happens in middleware, before any query runs.
  A migration is applied when something has queried the database and seen it.
  The `git push` hook runs `check:prod` for you and refuses the push on drift;
  running it here just means you find out before you have written the commit.

## 6. Durable residue → `CLAUDE.md`, edited in place

Only if this changed a **rule**, or added an invariant, gotcha, or vocabulary term.
The test: *would a fresh session behave incorrectly without this line?* Edit in
place; never append a dated paragraph. There is **no size budget and no hook** —
that gate was deleted 2026-07-28 (DECISIONS.md); keep the file short by moving
narrative out and editing rules in place, and never by deleting a real rule.

Money, stock and soft-archive invariants live under "Architectural decisions — do
not silently change these". If you touched one of those, updating it is mandatory.

## 7. Worklog row

Append or extend today's row in `docs/WORKLOG.md` (see `session-start`). Update the
monthly total.

## 8. Commit and push

```bash
git add <explicit paths>
git commit -F - <<'MSG'
...
MSG
git push origin main
```

- **Explicit paths only.** Blanket `git add -A` is blocked by a hook: it once swept
  an unrelated working-tree change into a docs commit, and this repo deploys
  push-to-`main`, so that reached production. Run `git status` first and confirm
  every dirty file belongs in *this* commit.
- Commit on `main`, push every time. No PRs, no feature branches.
- **Push-to-`main` is the deploy.** Treat every commit as a release.
