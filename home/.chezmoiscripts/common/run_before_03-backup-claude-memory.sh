#!/bin/bash
# Auto-backup pre-existing ~/.claude/memory/ before chezmoi's symlink_memory
# tries to land. Idempotent: no-op if already a symlink or doesn't exist.
#
# Triggers when:
# - First run on a new machine that already had ~/.claude/memory/ (e.g. Anthropic
#   shipped a global memory feature, or you populated it manually)
# - Someone deleted the symlink and a regular dir was recreated
#
# After backup, run `reorganize-memory` skill to merge .bak.<timestamp>/
# content into the vault.

set -e

TARGET="$HOME/.claude/memory"

# Only act if it exists AND is NOT a symlink
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP="$TARGET.bak.$TIMESTAMP"
  echo "→ Backing up pre-existing $TARGET to $BACKUP"
  echo "  (run \`reorganize-memory\` skill afterward to merge content into vault)"
  mv "$TARGET" "$BACKUP"
fi

exit 0
