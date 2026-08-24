#!/usr/bin/env bash
# Switch which database the dev server talks to, and say so out loud.
#
# WHY THIS EXISTS: the app URL is http://localhost:3000 whether you are on the
# local copy or on production. Nothing in the browser tells you which — that is
# how test bikes end up in front of Dennis. This script makes the switch one
# command, and `use-db.sh` with no argument answers "which am I on?".
#
# The stored copies live in env/ rather than as .env.something, because Next
# auto-loads .env.production.local and friends — a stored copy with one of
# those names would be read for real.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE="$ROOT/.env.local"
STORE="$ROOT/env"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
bold()  { printf '\033[1m%s\033[0m\n' "$1"; }

url_of() { grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$1" 2>/dev/null | cut -d= -f2- || true; }

describe() {
  local url; url="$(url_of "$LIVE")"
  if [ -z "$url" ]; then
    red "No NEXT_PUBLIC_SUPABASE_URL in .env.local — nothing configured."
    return
  fi
  case "$url" in
    *127.0.0.1*|*localhost*) green "LOCAL   → $url" ;;
    *)                       red   "PRODUCTION → $url" ;;
  esac
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/use-db.sh                which database is .env.local pointing at?
  scripts/use-db.sh local          point at the local Supabase stack
  scripts/use-db.sh prod           point at production
  scripts/use-db.sh save <name>    snapshot the current .env.local as env/<name>.env

After switching, RESTART the dev server — Next reads .env.local at startup,
not on change.
USAGE
}

case "${1:-}" in
  "")
    describe
    ;;
  local|prod)
    target="$STORE/$1.env"
    if [ ! -f "$target" ]; then
      red "Missing $target"
      echo "Save one first:  scripts/use-db.sh save $1"
      exit 1
    fi
    if [ -z "$(url_of "$target")" ]; then
      red "$target has no NEXT_PUBLIC_SUPABASE_URL — refusing to switch to it."
      exit 1
    fi
    cp "$target" "$LIVE"
    bold "Switched:"
    describe
    echo "Restart the dev server for this to take effect."
    ;;
  save)
    name="${2:-}"
    [ -z "$name" ] && { usage; exit 1; }
    mkdir -p "$STORE"
    cp "$LIVE" "$STORE/$name.env"
    bold "Saved current .env.local as env/$name.env"
    describe
    ;;
  *)
    usage
    exit 1
    ;;
esac
