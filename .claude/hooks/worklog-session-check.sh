#!/usr/bin/env bash
# SessionStart: put the state of the hours ledger in front of the assistant at
# the exact moment the session-start ritual is supposed to fire.
#
# Why: the ritual lives in the /session-start skill, which fires either when the
# user types it or when the assistant *notices* it is the first exchange of a new
# working day. On 2026-07-26 it noticed neither — a session opened with a docs
# question, ran four commits, and never logged a row. The ledger was saved only
# because a parallel session happened to run its own session-end ritual. That is
# luck, not process, and it is the same failure class as the rules that already
# became hooks: a trigger that depends on remembering will eventually not.
#
# This does NOT nag and cannot block — SessionStart hooks are informational.
# It states facts and stays silent when there is nothing worth saying.
#
# Deliberately quiet when today already has a row: the common case should cost
# nothing. And per CLAUDE.md, "days without a row = didn't work" — so a missing
# row is reported as a fact, never as a task.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

log="docs/WORKLOG.md"
[ -f "$log" ] || exit 0

today=$(date +%Y-%m-%d)
today_label=$(date "+%a %Y-%m-%d")

# Already logged? Then there is nothing to say.
grep -q "^| .* $today " "$log" && exit 0
grep -q "| $today_label |" "$log" && exit 0

last=$(grep -oE '^\| (Mon|Tue|Wed|Thu|Fri|Sat|Sun) [0-9]{4}-[0-9]{2}-[0-9]{2}' "$log" \
  | tail -1 | sed 's/^| //')
[ -z "$last" ] && exit 0

commits=$(git log --since="$today 00:00" --oneline 2>/dev/null | wc -l | tr -d ' ')

if [ "$commits" -gt 0 ]; then
  msg="WORKLOG: $commits commit(s) today ($today_label) with no ledger row yet — last row is $last. Work has already landed unlogged; add the row (see the /session-start skill)."
else
  msg="WORKLOG: no row for today ($today_label); last row is $last. If this session turns into real work, open the ledger — /session-start. If it stays a quick question, no row is correct."
fi

# additionalContext is the SessionStart-specific channel; systemMessage is the
# generic one. Emitting both means the note lands whichever the runtime reads,
# and an unrecognized field is ignored rather than fatal.
jq -nc --arg m "$msg" '{
  systemMessage: $m,
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: $m }
}'
