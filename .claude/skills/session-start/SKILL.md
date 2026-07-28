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
- **Keep the summary under ~300 characters** — a headline plus one clause.
  `.claude/hooks/worklog-row-budget.sh` flags anything longer on save. The old rule
  said "one line per row", which caught nothing: July rows reached 4–6k characters
  and were still one line. Detail belongs in `docs/archive/HISTORY.md`, which
  carries commit refs; the ledger answers only *how many hours, on what*.
- If a day's work genuinely needs a paragraph, that is the signal to write the
  HISTORY section, not to grow the row.

## 3. First session of a new month: consolidate CLAUDE.md

Check the previous WORKLOG row's month against today's. If the month just turned,
read `CLAUDE.md` **end to end** — not grep, not skim — looking for two things only:

- **Rules that contradict each other.** This is the actual failure mode; no tool
  detects it, reading does. (Precedent: the file's own length rule said `~530`
  while the hook enforcing it was set to `495` — so it fired on every edit while
  the rule said the file was fine. Nothing surfaced that; it took reading.)
- **Facts that have drifted**, especially counts. Fix by **deleting the number,
  not updating it** — see the no-counts rule in `CLAUDE.md`. (Precedent: the
  worklog cap read `~200` characters in `CLAUDE.md` while the hook and this skill
  both said `300`.)

Fix what you find in the same session, and put anything structural in
`DECISIONS.md`. **This is the only trigger there is** — there is deliberately no
size gate, and "when it feels heavy" never fires.

## 4. Do not

- Do not rewrite `docs/STATUS.md` at session start. That is the session-*end* ritual,
  and it is an overwrite — see the `ship-it` skill.
- Do not log Munin time here. `~/workspace/code/munin` has its own worklog; separate
  engagement.
