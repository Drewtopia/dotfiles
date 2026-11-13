#!/usr/bin/env bash
# Tells the session when its branch is behind its upstream, so it reads current files, not stale ones.
# gap: the session's start-up git status has no behind count, and `git status -sb` shows one only after a fetch.
# shortcut: a remote name with a slash is misread, upgrade if one appears.
set -uo pipefail

up=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || exit 0
timeout 5 git fetch -q "${up%%/*}" "${up#*/}" 2>/dev/null || true
behind=$(git rev-list --count 'HEAD..@{u}' 2>/dev/null) || exit 0
[ "$behind" -gt 0 ] || exit 0
echo "This checkout is $behind commits behind $up, so its files are stale. Run \`git pull --ff-only\` before reading code or docs here."
