#!/usr/bin/env bash
# PostToolUse check on Write|Edit: warn the moment CLAUDE.md exceeds its stated
# line budget.
#
# Why: this file reached 812 lines by appending every fix as it landed, until it
# was loading ~15k tokens of mostly-history into every session and contradicting
# itself in nine places. The budget was written into CLAUDE.md itself, which
# makes it honour-system. This makes it observable at the moment it's breached.
#
# Usage: claude-md-budget.sh <max-lines>
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

jq -nc --arg m "CLAUDE.md is now $n lines, past its $budget-line budget. Per its own rule: narrative → docs/archive/HISTORY.md, current state → docs/STATUS.md, decisions → docs/DECISIONS.md, parked ideas → docs/BACKLOG.md. Edit rules in place; don't append dated paragraphs. Test for every line: would a fresh session behave incorrectly without it?" \
  '{systemMessage:$m}'
