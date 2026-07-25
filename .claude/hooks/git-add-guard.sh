#!/usr/bin/env bash
# PreToolUse guard on blanket `git add`.
#
# Why this exists: on 2026-07-25 a `git add -A` in a sibling repo swept an
# unrelated, uncommitted working-tree change into a docs commit whose message
# said "Docs-only; no code touched" — and that repo deploys push-to-main, so
# unreviewed code reached production. Staging explicit paths makes the class of
# mistake impossible.
#
# Blocks: git add -A / --all / .   Allows: git add <explicit paths>
set -uo pipefail

cmd=$(cat | jq -r '.tool_input.command // ""')

printf '%s' "$cmd" \
  | grep -qE '(^|[;&|]|[[:space:]])git[[:space:]]+add[[:space:]]+([^;&|]*[[:space:]])?(-A|--all|\.)([[:space:]]|$)' \
  || exit 0

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

dirty=$(git status --porcelain | head -40 | sed 's/^/    /')
[ -z "$dirty" ] && exit 0   # nothing to sweep; harmless

jq -nc --arg d "$dirty" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: (
      "Blanket `git add` is disabled in this repo.\n\nIt once swept an unrelated working-tree change into a docs commit and deployed it. Stage explicit paths instead:\n\n    git add path/one path/two\n\nEverything currently dirty — check whether ALL of it belongs in your commit:\n" + $d
    )
  }
}'
