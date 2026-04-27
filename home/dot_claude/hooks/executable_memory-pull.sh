#!/bin/bash
# Auto-pull memory vault at session start.
# Silent on failure (no network / first run before vault clone).
cd ~/.claude/memory 2>/dev/null || exit 0
[ -d .git ] || exit 0
git pull --quiet --rebase --autostash 2>/dev/null || true
exit 0
