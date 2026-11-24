#!/usr/bin/env bash
# PreToolUse: the harness commits with core.hooksPath=/dev/null, so run the repo's
# lefthook pre-commit (if configured) and a betterleaks scan (gitleaks when betterleaks is
# absent) on staged files.
# In a public GitHub repo it also runs public-leaks.toml over the staged files and
# the commit message, for private IPs, tailnet hosts, work names and foreign issue refs.

set -uo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[[ -z "$COMMAND" ]] && exit 0

GIT_COMMIT='(^|[^a-zA-Z])git([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'
if ! printf '%s' "$COMMAND" | grep -qE "$GIT_COMMIT"; then
    exit 0
fi

# A path as the command wrote it: one layer of quotes off, a leading `~` expanded. No eval:
# the command text is untrusted.
unquote_path() {
    local p="${1%\"}"
    p="${p#\"}"; p="${p%\'}"; p="${p#\'}"
    printf '%s' "${p/#\~/$HOME}"
}

# Follow the command's own `cd` so the right repo is checked.
CD_TARGET=$(printf '%s' "$COMMAND" \
    | grep -oE '(^|&&|;)[[:space:]]*cd[[:space:]]+[^&;|]+' \
    | tail -1 | sed -E 's/^.*cd[[:space:]]+//; s/[[:space:]]+$//')
if [[ -n "$CD_TARGET" ]]; then
    CD_TARGET=$(unquote_path "$CD_TARGET")
    [[ -d "$CD_TARGET" ]] && cd "$CD_TARGET" || true
fi

# Then each `-C <dir>` of the commit, each relative to the one before, as git applies them.
# A -C naming a missing directory fails the commit itself, so there is nothing to scan.
while read -r dir; do
    cd "$(unquote_path "$dir")" 2>/dev/null || exit 0
done < <(printf '%s' "$COMMAND" | grep -oE "$GIT_COMMIT" | tail -1 \
    | grep -oE -- '-C[[:space:]]+[^[:space:]]+' | sed -E 's/^-C[[:space:]]+//')

# `git commit -F <file>` / `--file <file>` takes its message from a file, resolved here
# against the commit's directory; `-F -` reads the command's own stdin, already in its text.
MSG_FILE=$(printf '%s' "$COMMAND" \
    | grep -oE '(^|[[:space:]])(-[a-zA-Z]*F|--file)(=|[[:space:]]*)[^[:space:];&|]+' \
    | tail -1 | sed -E 's/^[[:space:]]*(-[a-zA-Z]*F|--file)=?[[:space:]]*//')
MSG_FILE=$(unquote_path "$MSG_FILE")
if [[ -n "$MSG_FILE" && "$MSG_FILE" != - && -f "$MSG_FILE" ]]; then
    MSG_FILE="$(cd "$(dirname "$MSG_FILE")" && pwd)/$(basename "$MSG_FILE")"
else
    MSG_FILE=""
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_ROOT" || exit 0

STAGED_COUNT=$(git diff --cached --name-only --diff-filter=ACMR | wc -l)
[[ "$STAGED_COUNT" -eq 0 ]] && exit 0

LEAK_RULES="$(dirname "${BASH_SOURCE[0]}")/public-leaks.toml"
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
        # GNU first: GNU stat takes -f as "filesystem status" and succeeds, so BSD-first never falls back.
        age=$(( $(date +%s) - $(stat -c %Y "$cache" 2>/dev/null || stat -f %m "$cache") ))
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

# Writes a temp leak-scanner config: the committed patterns plus rules for the private names, which
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

# betterleaks reads gitleaks configs and gitleaks:allow comments. v2 drops --staged, so
# mise pins 1.x.
LEAKS=$(command -v betterleaks || command -v gitleaks || true)
if [[ -n "$LEAKS" ]]; then
    RAN_SOMETHING=1
    if ! "$LEAKS" git --staged --redact --no-banner . 2>&1 >&2; then
        echo "" >&2
        echo "BLOCKED: ${LEAKS##*/} found secrets in staged files." >&2
        echo "Tip: review with \`${LEAKS##*/} git --staged -v\` and remove the secrets." >&2
        FAILED=1
    fi

    if [[ "$(repo_visibility)" != "PRIVATE" ]]; then
        LEAK_CONFIG=$(leak_config) || LEAK_CONFIG=""
        if [[ -n "$LEAK_CONFIG" ]]; then
            LEAKED=0
            "$LEAKS" git --staged --redact --no-banner --config "$LEAK_CONFIG" . 2>&1 >&2 || LEAKED=1
            # The commit message is in the command text, so scan that too.
            printf '%s\n' "$COMMAND" \
                | "$LEAKS" stdin --redact --no-banner --config "$LEAK_CONFIG" 2>&1 >&2 || LEAKED=1
            if [[ -n "$MSG_FILE" ]]; then
                "$LEAKS" stdin --redact --no-banner --config "$LEAK_CONFIG" <"$MSG_FILE" 2>&1 >&2 || LEAKED=1
            fi
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
    echo "INFO: git-commit-precheck: no lefthook or leak scanner available; allowing commit." >&2
fi

exit 0
