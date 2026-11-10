#!/usr/bin/env bash
# Shows the session the lessons from its repo's MISTAKES.md, which /close appends to.
# Headings and Prevention/Recurred paragraphs only: a long log costs every session its full text.
# Labels come as `**Prevention** —`, `**Prevention:**` or `- **Prevention:**`.
# gap: an @import in CLAUDE.md loads a file whole, and only from a path every worktree has;
# MISTAKES.md is gitignored, so it lives in the main checkout alone.
set -uo pipefail

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=$(dirname "$common")
log="$main/MISTAKES.md"
[ -s "$log" ] && [ ! -L "$log" ] || exit 0

# A log git tracks came with the clone, so in someone else's repo it is their text, not Drew's lessons.
# icase: on a case-insensitive disk a tracked mistakes.md is the same file.
# fsmonitor off: ls-files would otherwise run a command named in the repo's own config.
if [ -n "$(git -C "$main" -c core.fsmonitor=false ls-files -- ':(icase)MISTAKES.md' 2>/dev/null)" ]; then
  case "$(git -C "$main" remote get-url origin 2>/dev/null)" in
    git@github.com:Drewtopia/* | ssh://git@github.com/Drewtopia/* | https://github.com/Drewtopia/*) ;;
    *) exit 0 ;;
  esac
fi

echo "Mistakes made in this repo before, from $log. Each heading is one; follow its Prevention:"
awk '
  /^## / { p = 0; print ""; print; next }
  /^(- )?\*\*[A-Za-z ]+:?\*\*/ { p = /^(- )?\*\*(Prevention|Recurred)/ }
  /^[[:space:]]*$/ { p = 0; next }
  p { print }
' "$log"
exit 0
