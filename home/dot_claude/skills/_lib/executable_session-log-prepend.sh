#!/usr/bin/env bash
# Prepend one entry to ~/.claude/memory/SESSION_LOG.md (vault-synced, cross-device).
# Derives date, machine, project and branch itself so they cannot drift — a
# hand-typed hostname is how the log ended up with two spellings of one machine.
# Refuses on a missing title/summary/artifact or an unknown color: a placeholder
# entry is drift with extra steps.
#   session-log-prepend.sh --title T --summary S --artifact A
#                          [--next N] [--name SESSION] [--color C] [--log PATH]
set -euo pipefail

log="${HOME}/.claude/memory/SESSION_LOG.md"
title="" summary="" artifact="" next="" name="" color=""
while [ $# -gt 0 ]; do
  case "$1" in
    --title)    title="${2-}";    shift 2 ;;
    --summary)  summary="${2-}";  shift 2 ;;
    --artifact) artifact="${2-}"; shift 2 ;;
    --next)     next="${2-}";     shift 2 ;;
    --name)     name="${2-}";     shift 2 ;;
    --color)    color="${2-}";    shift 2 ;;
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

case "$color" in
  ""|red|yellow|orange|blue|green|pink) ;;
  *) printf 'refusing: --color must be red, yellow, orange, blue, green or pink\n' >&2; exit 2 ;;
esac

machine=$(hostname -s | tr '[:upper:]' '[:lower:]')
branch=""
if root=$(git rev-parse --show-toplevel 2>/dev/null); then
  project=$(basename "$root")
  branch=$(git branch --show-current 2>/dev/null || true)
else
  project="$PWD"
fi

entry=$(printf '## %s — %s\n\n%s' "$(date +%Y-%m-%d)" "$title" "$summary")
[ -n "$next" ] && entry+=$(printf '\n\nNext: %s' "$next")
entry+=$(printf '\n\n- Machine: %s\n- Project: %s' "$machine" "$project")
[ -n "$branch" ] && entry+=$(printf '\n- Branch: %s' "$branch")
[ -n "$name" ] && entry+=$(printf '\n- Session: %s' "$name")
[ -n "$color" ] && entry+=$(printf '\n- Color: %s' "$color")
entry+=$(printf '\n- Main artifact: %s' "$artifact")

tmp="${log}.tmp.$$"
{ printf '%s\n\n' "$entry"; cat "$log" 2>/dev/null || true; } > "$tmp"
mv "$tmp" "$log"
printf 'prepended to %s\n' "$log"
