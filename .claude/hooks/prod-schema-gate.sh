#!/usr/bin/env bash
# PreToolUse gate on `git push`: refuse to push while PRODUCTION is behind
# migrations/.
#
# WHY PUSH AND NOT COMMIT. Push-to-`main` IS the deploy. A commit is harmless;
# the push is the moment code that reads a new column starts serving customers.
# On 2026-09-04 that gap shipped `/offers` against a production database missing
# migrations 98 and 99, and it threw a 500 for every visitor from that moment
# until they were applied. Committing the migration file was never the problem —
# nobody had applied it.
#
# WHY IT DENIES WHEN IT CANNOT CHECK. The excuse that let 98/99 through was
# literally "there was no way to query prod, so it went out unverified". A gate
# that fails open on an unreachable database rebuilds that hole. So an auth
# failure, a network failure or a missing ledger all DENY, and the override is
# deliberate and visible:
#
#     SKIP_SCHEMA_GATE=1 git push origin main
#
# Use it when you genuinely intend to push without a verified database — a
# docs-only fix while offline, say — and not to get past a real drift.
set -uo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

# Registered against the broad `Bash` matcher, so it sees every command. Loose
# substring match on purpose, for the same asymmetry gates.sh documents: a false
# positive costs one wasted query, a false negative silently disables the gate.
case "$cmd" in
  *git*push*) ;;
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

if [ "${SKIP_SCHEMA_GATE:-}" = "1" ]; then
  note "Schema gate skipped (SKIP_SCHEMA_GATE=1). Production was NOT verified."
fi

if ! out=$(node scripts/check-prod-schema.mjs 2>&1); then
  deny "Push refused — production schema is not in sync with migrations/.

$out
Push-to-main is the deploy: shipping code that reads columns production does not
have is exactly the 2026-09-04 /offers outage. Apply the migrations, re-run
\`npm run check:prod\`, then push.

If you must push anyway (docs-only, or offline), say so explicitly:
    SKIP_SCHEMA_GATE=1 git push origin main"
fi

note "Schema gate: $(printf '%s' "$out" | tail -1)"
