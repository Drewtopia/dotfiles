#!/usr/bin/env bash
# PreToolUse: the harness commits with core.hooksPath=/dev/null, so run the repo's
# lefthook pre-commit (if configured) and a gitleaks scan (if installed) on staged files.

set -uo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[[ -z "$COMMAND" ]] && exit 0

if ! echo "$COMMAND" | grep -qE '(^|[^a-zA-Z])git( -c [^ ]+)* commit( |$)'; then
    exit 0
fi

# Follow the command's own `cd` so the right repo is checked. No eval: the command
# text is untrusted, so `~` is expanded by parameter substitution.
CD_TARGET=$(printf '%s' "$COMMAND" \
    | grep -oE '(^|&&|;)[[:space:]]*cd[[:space:]]+[^&;|]+' \
    | tail -1 | sed -E 's/^.*cd[[:space:]]+//; s/[[:space:]]+$//')
if [[ -n "$CD_TARGET" ]]; then
    CD_TARGET="${CD_TARGET%\"}"; CD_TARGET="${CD_TARGET#\"}"
    CD_TARGET="${CD_TARGET%\'}"; CD_TARGET="${CD_TARGET#\'}"
    CD_TARGET="${CD_TARGET/#\~/$HOME}"
    [[ -d "$CD_TARGET" ]] && cd "$CD_TARGET" || true
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_ROOT" || exit 0

STAGED_COUNT=$(git diff --cached --name-only --diff-filter=ACMR | wc -l)
[[ "$STAGED_COUNT" -eq 0 ]] && exit 0

FAILED=0
RAN_SOMETHING=0

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

if command -v gitleaks >/dev/null 2>&1; then
    RAN_SOMETHING=1
    if ! gitleaks git --staged --redact --no-banner . 2>&1 >&2; then
        echo "" >&2
        echo "BLOCKED: gitleaks found secrets in staged files." >&2
        echo "Tip: review with \`gitleaks git --staged -v\` and remove the secrets." >&2
        FAILED=1
    fi
fi

if [[ "$FAILED" -eq 1 ]]; then
    exit 2
fi

if [[ "$RAN_SOMETHING" -eq 0 ]]; then
    echo "INFO: git-commit-precheck: no lefthook/gitleaks available; allowing commit." >&2
fi

exit 0
