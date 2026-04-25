#!/usr/bin/env bash
# PreToolUse Edit|Write guard for jj repos: refuse to modify trunk/develop.
# Run: jj new before editing.

set -uo pipefail
test -d .jj || exit 0

if jj log -r @ --no-graph -T 'if(self.contained_in("trunk()") || self.contained_in("develop()"), "BLOCKED")' 2>/dev/null | grep -q BLOCKED; then
    echo 'Cannot modify trunk or develop - run: jj new' >&2
    exit 1
fi
exit 0
