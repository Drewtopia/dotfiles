#!/usr/bin/env bash
# Session-start git workflow check.
# Cross-platform (Linux, macOS, Windows Git Bash). Non-blocking — emits
# warnings to stdout, which Claude Code appends to the session context.

set -uo pipefail
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

BRANCH_AGE_WARN_DAYS=3
COMMITS_AHEAD_WARN=20
WORKTREE_AGE_WARN_DAYS=7

WARNINGS=()
NOW_TS=$(date +%s)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# First existing integration branch wins. Empty means none found —
# branch-age and commits-ahead checks skip, but dirty/stale-worktree
# checks still run.
INTEG="develop"
git rev-parse --verify "$INTEG" >/dev/null 2>&1 || INTEG="main"
git rev-parse --verify "$INTEG" >/dev/null 2>&1 || INTEG="master"
git rev-parse --verify "$INTEG" >/dev/null 2>&1 || INTEG=""

if [[ -n "$INTEG" && "$BRANCH" != "main" && "$BRANCH" != "develop" && "$BRANCH" != "master" ]]; then
    FIRST=$(git log --reverse --pretty=format:%H "$INTEG..HEAD" 2>/dev/null | head -1)
    if [[ -n "$FIRST" ]]; then
        FIRST_TS=$(git log -1 --pretty=format:%ct "$FIRST")
        AGE=$(( (NOW_TS - FIRST_TS) / 86400 ))
        (( AGE > BRANCH_AGE_WARN_DAYS )) && \
            WARNINGS+=("Branch '$BRANCH' is ${AGE}d old (>${BRANCH_AGE_WARN_DAYS}d). Consider merging or splitting.")
    fi
    AHEAD=$(git rev-list --count "$INTEG..HEAD" 2>/dev/null || echo 0)
    (( AHEAD > COMMITS_AHEAD_WARN )) && \
        WARNINGS+=("Branch '$BRANCH' is ${AHEAD} commits ahead of $INTEG (>${COMMITS_AHEAD_WARN}).")
fi

DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
(( DIRTY > 0 )) && WARNINGS+=("Working tree has ${DIRTY} uncommitted change(s).")

if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    BEHIND=$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo 0)
    (( BEHIND > 0 )) && WARNINGS+=("Branch is ${BEHIND} commit(s) behind upstream.")
fi

MAIN_TOPLEVEL=$(git rev-parse --show-toplevel)
STALE=()
while IFS= read -r line; do
    [[ "$line" =~ ^worktree[[:space:]](.+)$ ]] || continue
    WT="${BASH_REMATCH[1]}"
    [[ "$WT" == "$MAIN_TOPLEVEL" ]] && continue
    LAST_TS=$(git -C "$WT" log -1 --pretty=format:%ct 2>/dev/null || echo 0)
    (( LAST_TS == 0 )) && continue
    A=$(( (NOW_TS - LAST_TS) / 86400 ))
    (( A > WORKTREE_AGE_WARN_DAYS )) && STALE+=("$WT (${A}d)")
done < <(git worktree list --porcelain)
(( ${#STALE[@]} > 0 )) && WARNINGS+=("Stale worktrees (>${WORKTREE_AGE_WARN_DAYS}d): ${STALE[*]}")

if (( ${#WARNINGS[@]} > 0 )); then
    echo "Git workflow check:"
    for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
exit 0
