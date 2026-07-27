#!/usr/bin/env bash
# PreToolUse gate on `git commit`: refuse the commit unless this project's
# gates pass. The convention lived as prose in CLAUDE.md ("tsc + build + test
# green before every commit"), which meant it depended on the assistant
# remembering. This makes it deterministic.
#
# Adapts to the project: runs `npm test` only when a test script exists, and
# NEVER runs `npm run build` while a dev server is listening — that clobbers
# the dev chunks and makes every page 500 with a misleading module-not-found
# (documented in docs/STATUS.md; it also served a stale PWA shell mid-session).
#
# Skips everything for docs-only commits; a .md file cannot break tsc.
set -uo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

# Is this actually a commit? The hook is registered against the `Bash` matcher,
# so it sees EVERY command. This guard was missing entirely: the only thing that
# stopped `ls` from triggering a full tsc+lint+build was an empty staging area,
# which is an accident rather than a design — with anything staged, unrelated
# commands paid the whole gate.
#
# Deliberately a loose substring match rather than a precise regex, because the
# two failure modes are not symmetric: a false positive only runs the gate on
# something harmless (slow, safe), while a false negative silently skips it —
# which is the entire bug this file has already had once. A tighter regex here
# missed `git -c key=value commit`, since the flag's value is its own token.
case "$cmd" in
  *git*commit*) ;;   # `git commit`, `git add … && git commit`, `git -c … commit`
  *) exit 0 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

deny() {
  jq -nc --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}
note() {
  jq -nc --arg m "$1" '{systemMessage:$m,suppressOutput:true}'
  exit 0
}

# Everything this commit could possibly contain: staged, unstaged or untracked.
# `git status --porcelain` covers all three, which is why this needs no
# special-casing — not for `git add … && git commit` (a PreToolUse hook runs
# BEFORE the command, so the index is still empty when we look), and not for
# `commit -a` (stages at commit time). Guessing at the index instead is what
# silently disabled this whole gate until 2026-07-27.
touched=$(git status --porcelain | sed 's/^...//;s/.* -> //')
if [ -n "$touched" ] && ! printf '%s\n' "$touched" | grep -qvE '\.md$'; then
  note "Gates skipped: docs-only ($(printf '%s\n' "$touched" | wc -l | tr -d ' ') path(s), all .md)."
fi

if ! out=$(npx --no-install tsc --noEmit 2>&1); then
  deny "Gate failed — \`tsc --noEmit\`. Fix before committing:
$(printf '%s' "$out" | tail -20)"
fi

# Lint runs before the build because it is ~40x faster and catches a class the
# other two miss entirely: React rules (component identity, ref access, effect
# purity) are invisible to tsc and do not fail a build. It was absent from this
# gate until 2026-07-26, which is how 16 errors accumulated unnoticed.
# Warnings do not block — eslint exits 0 on them; see eslint.config.mjs for
# which rules are deliberately advisory.
if node -e 'const s=require("./package.json").scripts||{};process.exit(s.lint?0:1)' 2>/dev/null; then
  if ! out=$(npm run lint 2>&1); then
    # Show only the ERROR lines with their file. eslint's stylish formatter
    # groups by file and lists warnings too, so a plain `tail` shows advisory
    # warnings and buries the error that actually failed the gate.
    errs=$(printf '%s\n' "$out" | awk '
      /^\// { file = $0; sub(".*/jensen-fms/", "", file); next }
      / error / { print file ":" $1 "  " substr($0, index($0, "error") + 6) }
    ' | head -25)
    [ -z "$errs" ] && errs=$(printf '%s' "$out" | tail -25)
    deny "Gate failed — \`npm run lint\`. React-rule and type-hygiene errors that tsc and next build both miss:
$errs"
  fi
fi

if node -e 'const s=require("./package.json").scripts||{};process.exit(s.test?0:1)' 2>/dev/null; then
  if ! out=$(npm test --silent 2>&1); then
    deny "Gate failed — \`npm test\`. Fix before committing:
$(printf '%s' "$out" | tail -25)"
  fi
fi

port=$(jq -r '.configurations[0].port // 3000' .claude/launch.json 2>/dev/null || echo 3000)
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  note "Gates: tsc + lint + tests passed. Build SKIPPED — a dev server is listening on :$port and building would clobber its chunks. Stop it and run \`npm run build\` before you trust this commit."
fi

if ! out=$(npm run build 2>&1); then
  deny "Gate failed — \`npm run build\` (tsc and tests passed). This is the class tsc misses: RSC boundary violations and other runtime-only failures.
$(printf '%s' "$out" | tail -25)"
fi

note "Gates green: tsc + lint + tests + build."
