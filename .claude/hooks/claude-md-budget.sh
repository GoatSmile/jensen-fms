#!/usr/bin/env bash
# PostToolUse check on Write|Edit: a NUDGE when CLAUDE.md grows past its soft
# target. Advisory only — it has never blocked anything and must not start.
#
# Why: this file reached 812 lines by appending every fix as it landed, until it
# was loading ~15k tokens of mostly-history into every session and contradicting
# itself in nine places. The target exists to catch that drift early.
#
# What it is NOT: a line limit to be satisfied. On 2026-07-26 the previous
# wording ("past its budget. Per its own rule…") read as a gate, so real
# invariants were deleted to squeeze under the number — and the number was
# raised immediately afterwards anyway. That is pure churn: content lost, no
# benefit. The only question worth asking when this fires is whether the NEW
# lines are narrative or invariants. Narrative moves out; invariants stay and
# the number moves instead.
#
# Usage: claude-md-budget.sh <soft-target-lines>
set -uo pipefail

budget="${1:-250}"
f=$(cat | jq -r '.tool_response.filePath // .tool_input.file_path // ""')

case "$f" in
  *CLAUDE.md) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

n=$(wc -l < "$f" | tr -d ' ')
[ "$n" -le "$budget" ] && exit 0

jq -nc --arg m "Nudge, not a blocker: CLAUDE.md is $n lines against a ~$budget soft target ($((n - budget)) over). Look at what you just added and ask only this — is it narrative or an invariant? Narrative belongs elsewhere (history → docs/archive/HISTORY.md, current state → docs/STATUS.md, decisions → docs/DECISIONS.md, parked ideas → docs/BACKLOG.md), and editing a rule in place beats appending a dated paragraph. If what you added is a genuine invariant — something a fresh session would get wrong without it — KEEP IT and raise the target in .claude/settings.json. Do not delete real rules to hit this number; that trade has already been made once and it was a mistake." \
  '{systemMessage:$m}'
