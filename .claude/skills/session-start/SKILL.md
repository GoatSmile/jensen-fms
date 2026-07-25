---
name: session-start
description: Begin a working session on this project — orient from STATUS.md, then append today's worklog row and reconcile the previous day's hours from commit timestamps. Use at the first exchange of a new working day, or when the user says "session start", "let's begin", "log today", or asks where things stand before starting work.
---

# Session start

Two things: **orient**, then **open the ledger**. In that order — the worklog row is
easier to write once you know what is actually in flight.

## 1. Orient

Read `docs/STATUS.md`. It is the session-death recovery file: it plus `CLAUDE.md`
should be enough to resume. Pay particular attention to:

- **In flight / next action** — where to pick up.
- **Landmines** — the things that will bite if you touch them unaware (the e-conomic
  trial-vs-production grant is the standing example).
- **Data-entry debts** — owner/admin work, not code. Don't "fix" these in code.

Don't read `docs/archive/HISTORY.md` unless something looks arbitrary and you need to
know why; it is a frozen narrative, not current state.

## 2. Append today's worklog row

`docs/WORKLOG.md` is a **table**, one row per working day, newest at the bottom,
grouped under a month heading:

```
| Thu 2026-07-23 | ~18 | Headline. What changed and why it mattered. |
```

Rules that are easy to get wrong:

- **One row per day.** If today already has a row, add a continuation
  (`| Sat 2026-07-25 (cont. 3) | ~2 | … |`) rather than editing the existing one.
- **Hours are estimates** unless the user corrects them. Mark them `~`. Derive from
  commit timestamps —
  `git log --since="yesterday 00:00" --pretty='%ad %s' --date=format:'%a %H:%M'` —
  and take the *span* of the commit block, not the number of commits.
- **Reconcile the previous row** if it was left an estimate. The user corrects with
  "log: Jul 9 was 7h" — apply it verbatim, don't argue.
- **Update the monthly total** line and the working-day count.
- **Days with no row = didn't work.** Never backfill a gap unasked.
- Rows before 2026-07-10 are reconstructed from git history and undercount planning
  calls and data entry — treat those totals as floors, not truth.
- It is an hours ledger with a substantive summary, not a diary.

## 3. Do not

- Do not rewrite `docs/STATUS.md` at session start. That is the session-*end* ritual,
  and it is an overwrite — see the `ship-it` skill.
- Do not log Munin time here. `~/workspace/code/munin` has its own worklog; separate
  engagement.
