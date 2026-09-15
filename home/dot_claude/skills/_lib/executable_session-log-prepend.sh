#!/usr/bin/env bash
# Prepend one entry to ~/.claude/memory/SESSION_LOG.md (vault-synced, cross-device).
# Derives date, machine and project itself so those three cannot drift — a
# hand-typed hostname is how the log ended up with two spellings of one machine.
# Refuses on a missing title/summary/artifact: a placeholder entry is drift
# with extra steps.
#   session-log-prepend.sh --title T --summary S --artifact A [--log PATH]
set -euo pipefail

log="${HOME}/.claude/memory/SESSION_LOG.md"
title="" summary="" artifact="" next=""
while [ $# -gt 0 ]; do
  case "$1" in
    --title)    title="${2-}";    shift 2 ;;
    --summary)  summary="${2-}";  shift 2 ;;
    --artifact) artifact="${2-}"; shift 2 ;;
    --next)     next="${2-}";     shift 2 ;;
    --log)      log="${2-}";      shift 2 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

for pair in "title:$title" "summary:$summary" "artifact:$artifact"; do
  if [ -z "${pair#*:}" ]; then
    printf 'refusing: --%s is required and must not be empty\n' "${pair%%:*}" >&2
    exit 2
  fi
done

machine=$(hostname -s | tr '[:upper:]' '[:lower:]')
if root=$(git rev-parse --show-toplevel 2>/dev/null); then
  project=$(basename "$root")
else
  project="$PWD"
fi

# --next is optional; when set it emits a `Next:` line the reckoning board reads.
if [ -n "$next" ]; then
  entry=$(printf '## %s — %s\n\n%s\n\nNext: %s\n\n- Machine: %s\n- Project: %s\n- Main artifact: %s\n' \
    "$(date +%Y-%m-%d)" "$title" "$summary" "$next" "$machine" "$project" "$artifact")
else
  entry=$(printf '## %s — %s\n\n%s\n\n- Machine: %s\n- Project: %s\n- Main artifact: %s\n' \
    "$(date +%Y-%m-%d)" "$title" "$summary" "$machine" "$project" "$artifact")
fi

tmp="${log}.tmp.$$"
{ printf '%s\n\n' "$entry"; cat "$log" 2>/dev/null || true; } > "$tmp"
mv "$tmp" "$log"
printf 'prepended to %s\n' "$log"
