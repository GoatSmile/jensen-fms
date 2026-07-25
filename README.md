# Jensen FMS

Fleet management system for Jensen Production / Logocykler — a Danish
workshop building custom branded bikes for hotels, municipalities, and
hospitals. Replaces fragmented Excel + paper workflows. Single-tenant,
solo-dev, in daily production use.

**Stack**: Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/ui ·
Supabase (Postgres, EU) · deployed on Vercel (push-to-`main` → prod, gated
behind Vercel SSO).

## Run it

```bash
npm install
npm run dev   # needs .env.local — variable list in docs/OPERATIONS.md
```

`docs/OPERATIONS.md` also has a cold-start runbook (rebuild from nothing:
Supabase project, migrations, env, deploy) and the full external-accounts /
secrets-location inventory.

## Where to start reading

| Doc | What it is |
|---|---|
| `docs/STATUS.md` | Where the work stands right now — **read this first** |
| `CLAUDE.md` | Durable rules: architecture invariants, conventions, vocabulary |
| `docs/DECISIONS.md` | Dated log of decisions and their reasons |
| `docs/OPERATIONS.md` | Accounts, secrets locations, deploy, backups, runbooks |
| `docs/BACKLOG.md` | Parked ideas + hardening list |
| `docs/plan-*.md` | Active plan documents |
| `docs/archive/` | `HISTORY.md` (shipped-work narrative) + closed plans |
| `docs/WORKLOG.md` | Hours ledger |

The database schema lives in `/migrations/` (sequentially numbered; never
modify an applied file).
