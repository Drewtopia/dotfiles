#!/usr/bin/env bash
# Top up agent guidance in a secondary git worktree.
#
# CLAUDE.md and the agent config directory are globally gitignored, so a fresh
# worktree gets the tracked AGENTS.md with nothing importing it and no rules at
# all. Worktrunk's post-start hook covers worktrees IT creates; this covers
# every other route -- the agent tooling's own worktree command, background
# sessions, plain `git worktree add` -- by topping up at session start rather
# than at creation time.
#
# Deliberately a SessionStart hook, not WorktreeCreate: WorktreeCreate replaces
# git worktree creation outright and a failure there fails the creation. This
# runs after the worktree exists and can only ever be additive.
#
# Always exits 0. A guidance top-up must never block a session.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "${root:-}" ] || exit 0

# First entry of `worktree list` is always the primary checkout. substr instead
# of $2 so a path containing spaces survives.
main=$(git -C "$root" worktree list --porcelain 2>/dev/null |
  awk '/^worktree /{print substr($0, 10); exit}')
[ -n "${main:-}" ] || exit 0
[ "$root" = "$main" ] && exit 0 # primary checkout, nothing to top up

# The gitignored CLAUDE.md pointers, as git reports them from the primary.
# Never clobber: a worktree may have deliberately diverged.
git -C "$main" status --ignored --porcelain 2>/dev/null |
  awk '/^!! /{p = substr($0, 4); if (p ~ /(^|\/)CLAUDE\.md$/) print p}' |
  while IFS= read -r rel; do
    [ -e "$root/$rel" ] && continue
    [ -d "$root/$(dirname "$rel")" ] || continue
    cp "$main/$rel" "$root/$rel" 2>/dev/null || true
  done

# Rules cannot ride along with the pointers above: the agent config directory is
# gitignored at the DIRECTORY level, so git reports the whole tree as one entry
# and never descends -- nothing inside it is individually addressable. Verified:
# with no .worktreeinclude at all, `wt step copy-ignored` still copies none of it.
#
# --update=none rather than -n: coreutils warns -n is non-portable and may
# change, and a flip to overwrite would silently eat local edits here.
if [ -d "$main/.claude/rules" ]; then
  mkdir -p "$root/.claude" 2>/dev/null || true
  cp -r --update=none "$main/.claude/rules" "$root/.claude/" 2>/dev/null || true
fi

# Hook scripts get a SYMLINK, not a copy. Project settings register hooks as
# `node "$CLAUDE_PROJECT_DIR/.claude/hooks/<name>"`, and CLAUDE_PROJECT_DIR
# resolves to the worktree -- so without this, every Bash call in a worktree
# fails that hook with "cannot find module" (node cjs/loader). Symlinked rather
# than copied because these are executable code: a stale copy would silently run
# an old version. The rules above stay a copy -- content a worktree may
# legitimately diverge on.
if [ -d "$main/.claude/hooks" ] && [ ! -e "$root/.claude/hooks" ]; then
  mkdir -p "$root/.claude" 2>/dev/null || true
  ln -s "$main/.claude/hooks" "$root/.claude/hooks" 2>/dev/null || true
fi

exit 0
