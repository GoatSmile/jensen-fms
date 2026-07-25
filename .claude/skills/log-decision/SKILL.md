---
name: log-decision
description: Record a decision in docs/DECISIONS.md — what was decided, why, and what was rejected — in the same commit as the code that implements it. Use when the owner locks a choice, when a deliberate dev call is made that a future session might otherwise reopen, or when the user says "log this decision" or "record why we did this".
---

# Log a decision

`docs/DECISIONS.md` is the **why** trail. `CLAUDE.md` holds the resulting rule in
the imperative; this file holds the dated reasoning behind it. Both, not either.

## The three rules

1. **Append-only.** Never edit an existing entry. If a decision changes, write a
   new entry that says **SUPERSEDES** the old one, and mark the old one superseded
   in place with a pointer — that single word is the only permitted edit.
2. **Same commit as the code.** An entry written later is a reconstruction, and
   reconstructions lose the rejected alternatives first. This rule was adopted
   2026-07-23 and had already slipped by 07-25 — two decisions (the provider verdict,
   the AI-receptionist tier) landed with no entry — which is why it is stated this
   bluntly.
3. **Record what was rejected.** An entry that only says what was chosen invites
   the question to be reopened. The rejected option, with its reason, is what
   closes it.

## Format

Group under a dated heading; add bullets under an existing date rather than
creating a second heading for the same day.

```markdown
## 2026-07-25 — Short title in the imperative or as a claim

- **What was decided**, stated as a rule. (Owner's words in *italics* when they
  drove it — *"simple solutions that work"* carries more than a paraphrase.)
  Why it holds. **Rejected:** the alternative, and the reason it lost.
```

## What belongs here

- Anything the owner locked, especially with their phrasing.
- A deliberate dev call a future session might undo without knowing the cost —
  a guard removed on purpose, an asymmetry accepted, a feature left unbuilt.
- A trade-off that looks like a bug. *Frozen-at-purchase* cost basis means editing
  a part's HS code does **not** retroactively fix historical PO lines — that is a
  decision, not a defect, and the entry is what stops someone "fixing" it.
- A thing left undone **on purpose**, with the measured reason — the parked CI
  pipeline, with the owner's *"I like the discipline"*, is the model.
- Vocabulary and IA locked with the owner (nav grouping, "New X" button copy).

## What does not belong here

- What shipped and how → `docs/WORKLOG.md`, or `docs/archive/HISTORY.md` for the
  narrative.
- Current state → `docs/STATUS.md`.
- The rule itself, in imperative form → `CLAUDE.md`.
- Ideas not yet decided → `docs/BACKLOG.md`.

## The standard to match

Read the **2026-05 founding modeling decisions** entry before writing a new one. It
works because each line is a rule a future session could otherwise plausibly
violate — money is always `(amount, currency)`; stock is `SUM` of movements, never a
stored field — and it points at `CLAUDE.md` for the full statements instead of
duplicating them. Entry, rule, and code each have one home.
