#!/usr/bin/env bash
# PostToolUse check on Write|Edit: flag WORKLOG.md rows that have grown from
# ledger entries into diary entries.
#
# Why: the rule was "one line per row — an hours ledger, not a diary", which
# measured the wrong thing. A 5,927-character paragraph is still one line, so
# the rule could never catch the failure it was written to prevent. July rows
# reached 4-6k characters while May/June rows sat at 250-400. The detail has a
# home already (docs/archive/HISTORY.md); the ledger answers "how many hours,
# on what".
#
# Usage: worklog-row-budget.sh <max-chars-per-row>
set -uo pipefail

budget="${1:-200}"
f=$(cat | jq -r '.tool_response.filePath // .tool_input.file_path // ""')

case "$f" in
  *WORKLOG.md) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

# Measure only the summary cell (3rd column), not the date/hours scaffolding.
over=$(awk -F'|' -v b="$budget" '
  /^\| (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ {
    n = length($4)
    if (n > b) { gsub(/^ +| +$/, "", $2); printf "    %s — %d chars\n", $2, n }
  }' "$f")

[ -z "$over" ] && exit 0

count=$(printf '%s\n' "$over" | wc -l | tr -d ' ')
jq -nc --arg m "docs/WORKLOG.md: $count row(s) past the ~$budget-char summary cap:
$over

It is an hours ledger, not a diary — headline plus one clause. Move the narrative to docs/archive/HISTORY.md (which carries commit refs) and leave the row answering only: how many hours, on what." \
  '{systemMessage:$m}'
