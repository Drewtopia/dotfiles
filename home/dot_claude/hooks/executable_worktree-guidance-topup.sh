#!/usr/bin/env bash
# Top up agent guidance in a secondary git worktree: the gitignored CLAUDE.md
# pointers, and a link to the primary's hooks. SessionStart rather than
# WorktreeCreate, which replaces worktree creation and fails it on error.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "${root:-}" ] || exit 0

# substr, not $2: a worktree path may contain spaces.
main=$(git -C "$root" worktree list --porcelain 2>/dev/null |
  awk '/^worktree /{print substr($0, 10); exit}')
[ -n "${main:-}" ] || exit 0
[ "$root" = "$main" ] && exit 0 # primary checkout, nothing to top up

git -C "$main" status --ignored --porcelain 2>/dev/null |
  awk '/^!! /{p = substr($0, 4); if (p ~ /(^|\/)CLAUDE\.md$/) print p}' |
  while IFS= read -r rel; do
    [ -e "$root/$rel" ] && continue
    [ -d "$root/$(dirname "$rel")" ] || continue
    cp "$main/$rel" "$root/$rel" 2>/dev/null || true
  done

# Symlink, not copy: $CLAUDE_PROJECT_DIR resolves to the worktree, so registered
# hooks must exist here, and a copy would silently run a stale version. Rules
# need no equivalent -- user-level rules load independently of the directory.
if [ -d "$main/.claude/hooks" ] && [ ! -e "$root/.claude/hooks" ]; then
  mkdir -p "$root/.claude" 2>/dev/null || true
  ln -s "$main/.claude/hooks" "$root/.claude/hooks" 2>/dev/null || true
fi

exit 0
