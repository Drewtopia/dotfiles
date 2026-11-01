#!/usr/bin/env bash
# PreToolUse: the harness commits with core.hooksPath=/dev/null, so run the repo's
# lefthook pre-commit (if configured) and a gitleaks scan (if installed) on staged files.
# In a public GitHub repo it also runs public-leaks.gitleaks.toml over the staged files and
# the commit message, for private IPs, tailnet hosts, work names and foreign issue refs.

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

LEAK_RULES="$(dirname "${BASH_SOURCE[0]}")/public-leaks.gitleaks.toml"
VISIBILITY_TTL_SECONDS=$((7 * 24 * 3600))
# A repo made public since it was cached would skip the leak scan, so PRIVATE lasts a day.
PRIVATE_TTL_SECONDS=$((24 * 3600))

# PUBLIC, PRIVATE or INTERNAL for a GitHub origin; PRIVATE for anything else (no remote, Azure
# DevOps), since only GitHub repos here are ever public. A GitHub URL the parser can't read is
# UNKNOWN. Answers are cached per repo, PRIVATE for a day and others for a week. When gh can't
# answer (offline, logged out), a stale cached answer is used unless it is PRIVATE; with none,
# the repo counts as public: a blocked commit is cheaper than a leak that gets pushed later.
repo_visibility() {
    local url slug cache answer age ttl
    url=$(git remote get-url origin 2>/dev/null) || { echo PRIVATE; return; }
    slug=$(printf '%s' "$url" | sed -nE 's#^(https://|ssh://)?([^@/]+@)?github\.com[^:/]*[:/]([^/]+/[^/]+)$#\3#p')
    slug="${slug%.git}"
    if [[ -z "$slug" ]]; then
        [[ "$url" == *github* ]] && echo UNKNOWN || echo PRIVATE
        return
    fi

    cache="${XDG_CACHE_HOME:-$HOME/.cache}/claude-hooks/repo-visibility/${slug//\//__}"
    if [[ -f "$cache" ]]; then
        answer=$(cat "$cache")
        age=$(( $(date +%s) - $(stat -f %m "$cache" 2>/dev/null || stat -c %Y "$cache") ))
        ttl=$VISIBILITY_TTL_SECONDS
        [[ "$answer" == PRIVATE ]] && ttl=$PRIVATE_TTL_SECONDS
        (( age < ttl )) && { echo "$answer"; return; }
    fi
    if answer=$(gh repo view "$slug" --json visibility -q .visibility 2>/dev/null) && [[ -n "$answer" ]]; then
        mkdir -p "$(dirname "$cache")" && printf '%s\n' "$answer" >"$cache"
        echo "$answer"; return
    fi
    if [[ -f "$cache" ]] && [[ "$(cat "$cache")" != PRIVATE ]]; then
        cat "$cache"; return
    fi
    echo "UNKNOWN"
}

# Writes a temp gitleaks config: the committed patterns plus rules for the private names, which
# come from fnox at run time (~/.config/fnox/private.toml when present, else the global config
# with its work.toml import). A name fnox doesn't have is skipped, not guessed.
leak_config() {
    [[ -f "$LEAK_RULES" ]] || return 1
    local out key value escaped fnox_args=()
    out=$(mktemp "${TMPDIR:-/tmp}/public-leaks.XXXXXX") || return 1
    cat "$LEAK_RULES" >"$out"
    [[ -f "$HOME/.config/fnox/private.toml" ]] && fnox_args=(-c "$HOME/.config/fnox/private.toml")
    command -v fnox >/dev/null 2>&1 || { echo "$out"; return; }
    for key in WORK_EMPLOYER WORK_AZ_ORG TAILNET_BASE_DOMAIN; do
        value=$(fnox ${fnox_args[@]+"${fnox_args[@]}"} get "$key" 2>/dev/null) || continue
        [[ -z "$value" ]] && continue
        escaped=$(printf '%s' "$value" | sed -E 's/[][\.*^$+?(){}|\\]/\\&/g')
        printf '\n[[rules]]\nid = "private-name-%s"\ndescription = "A name held in fnox %s"\nregex = '"'''"'(?i)\\b%s\\b'"'''"'\n' \
            "$(printf '%s' "$key" | tr 'A-Z_' 'a-z-')" "$key" "$escaped" >>"$out"
    done
    echo "$out"
}

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

    if [[ "$(repo_visibility)" != "PRIVATE" ]]; then
        LEAK_CONFIG=$(leak_config) || LEAK_CONFIG=""
        if [[ -n "$LEAK_CONFIG" ]]; then
            LEAKED=0
            gitleaks git --staged --redact --no-banner --config "$LEAK_CONFIG" . 2>&1 >&2 || LEAKED=1
            # The commit message is in the command text, so scan that too.
            printf '%s\n' "$COMMAND" \
                | gitleaks stdin --redact --no-banner --config "$LEAK_CONFIG" 2>&1 >&2 || LEAKED=1
            rm -f "$LEAK_CONFIG"
            if [[ "$LEAKED" -eq 1 ]]; then
                echo "" >&2
                echo "BLOCKED: this repo is public (or its visibility is unknown) and the commit" >&2
                echo "names a private IP, tailnet host, the employer or another owner's issue." >&2
                echo "Replace it with a placeholder (<host>, <employer>, <owner>/<repo>#<n>) and retry." >&2
                echo "A deliberate example can carry a trailing gitleaks:allow comment." >&2
                FAILED=1
            fi
        fi
    fi
fi

if [[ "$FAILED" -eq 1 ]]; then
    exit 2
fi

if [[ "$RAN_SOMETHING" -eq 0 ]]; then
    echo "INFO: git-commit-precheck: no lefthook/gitleaks available; allowing commit." >&2
fi

exit 0
