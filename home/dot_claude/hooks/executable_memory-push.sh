#!/bin/bash
# Auto-commit + push memory vault on Stop. Skip if no changes.
cd ~/.claude/memory 2>/dev/null || exit 0
[ -d .git ] || exit 0
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "auto: $(date -u +%Y-%m-%dT%H:%M) via $(hostname)" --quiet
  git push --quiet 2>/dev/null || true
fi
exit 0
