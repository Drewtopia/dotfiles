#!/usr/bin/env bash
# PreToolUse Edit|Write helper for jj repos: auto-describe the working revision
# with the file Claude is touching, so jj log shows what changed.

set -uo pipefail
test -d .jj || exit 0

file=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.file_path // empty' | xargs basename 2>/dev/null)
[ -z "$file" ] && exit 0

desc=$(jj log -r @ --no-graph -T 'description' 2>/dev/null)
if [ -z "$desc" ] || [ "$desc" = "(no description set)" ]; then
    jj describe -m "claude: $file" --quiet 2>/dev/null
elif echo "$desc" | grep -q '^claude:' && ! echo "$desc" | grep -qF "$file"; then
    jj describe -m "$desc, $file" --quiet 2>/dev/null
fi
exit 0
