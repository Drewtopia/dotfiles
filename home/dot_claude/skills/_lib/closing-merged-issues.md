# Closing issues behind merged PRs

Shared by `close`, `reconcile-tracker` and `realign-tracker`. They differ only in **reach** —
which done-set they hand in. The rule for turning a done-set into closures is here, once.

## Pick a reach

| Reach | Set | Sees |
|---|---|---|
| This session's branches | `bash ~/.claude/skills/_lib/merged-set.sh` | local branches merged or `[gone]` |
| Every merged PR | `bash ~/.claude/skills/_lib/merged-prs.sh` | Azure PR history, including branches already pruned locally |

Both emit `<ref>\t<linked-id>` (`merged-prs.sh` adds the PR title as a third column). Join on
column 2. `merged-prs.sh` pages to exhaustion — a single `--top` truncates in silence, and a
missed ghost then reads as a clean zero.

## Find the ghosts

A **ghost** is an issue still open whose linked PR has merged. Compare the done-set's `GH-<n>`
values against the open-issue list, sorting **both sides the same way** — `comm` on mismatched
orders returns an empty intersection and looks like a pass.

A bare open issue with no merged PR is live work, not a ghost.

## Close, with one exemption

Report each ghost as `GH-<n> — PR <id> "<title>" merged → close?` and close only on a
per-issue confirmation:

```bash
gh issue close <n> ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} \
  --comment "Closed by merged PR <id>."
```

**A PRD parent is exempt.** A merged PR against a parent completes one sub-issue, not the
parent — closing it buries the sub-issues still open under it. When the ghost is a PRD or has
sub-issues, report it as `parent PRD — check sub-issues` and leave it open.

Closure comes only from a confirmed merged PR, and every closure is reversible.
