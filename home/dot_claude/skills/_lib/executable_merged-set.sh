#!/usr/bin/env bash
# Shared "done branch" set for clean-workspace + reconcile-tracker.
# Output: <branch>\t<linked-id>  (GH-<n> | ADO-<5digit> | -), one per line.
# done = gone-from-remote OR merged-into-trunk, MINUS current HEAD and the trunk itself.
# Trunk auto-detected from origin/HEAD (falls back develop>main>master); override with TRUNK env.
set -uo pipefail
git fetch --prune origin >/dev/null 2>&1 || true
cur=$(git branch --show-current 2>/dev/null || echo '')
trunk="${TRUNK:-$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')}"
if [ -z "$trunk" ]; then
  for c in develop main master; do
    git show-ref -q "refs/remotes/origin/$c" && { trunk="$c"; break; }
  done
fi
{
  git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | awk '/\[gone\]/{print $1}'
  [ -n "$trunk" ] && git branch --format='%(refname:short)' --merged "origin/$trunk" 2>/dev/null
} | sort -u | while IFS= read -r b; do
  [ -z "$b" ] && continue
  case "$b" in "$cur"|"$trunk"|develop|main|master) continue;; esac
  id=$(printf '%s' "$b" | grep -oiE '(issue-|gh-?)[0-9]{2,4}' | grep -oE '[0-9]{2,4}' | head -1 || true)
  if [ -n "$id" ]; then link="GH-$id"
  else
    wi=$(printf '%s' "$b" | grep -oE '[0-9]{5}' | head -1 || true)
    [ -n "$wi" ] && link="ADO-$wi" || link="-"
  fi
  printf '%s\t%s\n' "$b" "$link"
done
