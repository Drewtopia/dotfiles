#!/usr/bin/env bash
# =============================================================================
# PreToolUse Hook: Git Commit Pre-Check
# =============================================================================
#
# Counters CC harness injecting `-c core.hooksPath=/dev/null` into commits.
# When CC tries to `git commit`, this hook runs the repo's own pre-commit
# checks (lefthook if configured, gitleaks as fallback) against staged files.
# Block = exit 2 with stderr feedback so CC fixes violations and retries.
#
# Order of strategies:
#   1. lefthook    if lefthook.yml (or .lefthook.yml) present and binary found
#   2. gitleaks    fallback secret-scan of staged diff (always runs if found)
#   3. no-op       if neither available, allow (graceful degrade)
#
# Exit codes:
#   0 = allow command
#   2 = block command (stderr fed back to Claude)
# =============================================================================

set -uo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[[ -z "$COMMAND" ]] && exit 0

# Detect `git commit` (allowing `-c key=val` flags between git and commit).
# Examples matched:
#   git commit -m "..."
#   git -c core.hooksPath=/dev/null commit -m "..."
#   ... && git commit --amend
if ! echo "$COMMAND" | grep -qE '(^|[^a-zA-Z])git( -c [^ ]+)* commit( |$)'; then
    exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_ROOT" || exit 0

STAGED_COUNT=$(git diff --cached --name-only --diff-filter=ACMR | wc -l)
[[ "$STAGED_COUNT" -eq 0 ]] && exit 0

FAILED=0
RAN_SOMETHING=0

# -----------------------------------------------------------------------------
# Strategy 1: lefthook
# -----------------------------------------------------------------------------
LEFTHOOK_CONFIG=""
for cfg in lefthook.yml .lefthook.yml lefthook.yaml .lefthook.yaml; do
    if [[ -f "$REPO_ROOT/$cfg" ]]; then
        LEFTHOOK_CONFIG="$cfg"
        break
    fi
done

if [[ -n "$LEFTHOOK_CONFIG" ]]; then
    LEFTHOOK_BIN=""
    if [[ -x "$REPO_ROOT/node_modules/.bin/lefthook" ]]; then
        LEFTHOOK_BIN="$REPO_ROOT/node_modules/.bin/lefthook"
    elif command -v lefthook >/dev/null 2>&1; then
        LEFTHOOK_BIN="lefthook"
    fi

    if [[ -n "$LEFTHOOK_BIN" ]]; then
        RAN_SOMETHING=1
        if ! "$LEFTHOOK_BIN" run pre-commit >&2; then
            echo "" >&2
            echo "BLOCKED: lefthook pre-commit failed ($LEFTHOOK_CONFIG)." >&2
            echo "Fix the violations above, re-stage, then retry the commit." >&2
            FAILED=1
        fi
    else
        echo "WARN: $LEFTHOOK_CONFIG present but lefthook binary not found; skipping." >&2
    fi
fi

# -----------------------------------------------------------------------------
# Strategy 2: gitleaks (always runs if available -- defense-in-depth)
# -----------------------------------------------------------------------------
if command -v gitleaks >/dev/null 2>&1; then
    RAN_SOMETHING=1
    if ! gitleaks git --staged --redact --no-banner . 2>&1 >&2; then
        echo "" >&2
        echo "BLOCKED: gitleaks found secrets in staged files." >&2
        echo "Tip: review with \`gitleaks git --staged -v\` and remove the secrets." >&2
        FAILED=1
    fi
fi

# -----------------------------------------------------------------------------
# Result
# -----------------------------------------------------------------------------
if [[ "$FAILED" -eq 1 ]]; then
    exit 2
fi

if [[ "$RAN_SOMETHING" -eq 0 ]]; then
    echo "INFO: git-commit-precheck: no lefthook/gitleaks available; allowing commit." >&2
fi

exit 0
