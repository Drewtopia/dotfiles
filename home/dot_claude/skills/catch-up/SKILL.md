---
name: catch-up
description: Re-entry briefing for the branch you're standing in — starts from its last SESSION_LOG Next line, checks what could have made it stale, and says whether it still holds. Use for /catch-up, or when returning to a worktree after a day or more away.
disable-model-invocation: true
---

# Catch up

Re-entry for the branch under your feet. `/close` already wrote down where this work stopped; this checks whether that is still true.

## 1. What was saved

```bash
git rev-parse --show-toplevel && git branch --show-current
git log -1 --format='%h %cr %s'
```

Find the newest `~/.claude/memory/SESSION_LOG.md` entry for this branch. Entries are `## <date> — <title>` blocks with an optional `Next:` line and metadata lines: `- Project:` (the checkout's directory name), `- Branch:`, `- Session:` (the `/rename` name) and `- Color:`.

Match `- Branch:` exactly against the current branch. Older entries have no `Branch:` line, and their `Project:` names only the checkout — entries from many branches of one repo share it, some with hand-typed suffixes — so a `Project:` match alone is not a match. For an older entry, require its title, `Next:` line, or artifact to name this branch, its PR, or its issue.

No matching entry → say so, and build "Saved" from this branch's `git log` alone.

Quote the entry's date and `Next:` line verbatim. Everything below tests it.

## 2. What could have moved since

Measure from the entry's date, or the last commit when there is no entry. Prefix each network call with `timeout 40`: a stalled host costs one line of the answer ("couldn't reach az"), never a guess.

**Branch vs trunk.** Trunk comes from `origin/HEAD`, else `develop`/`main`/`master`.

```bash
git fetch --prune origin
git rev-list --left-right --count origin/<trunk>...HEAD                # behind / ahead
git branch --merged origin/<trunk> --format='%(refname:short)'         # lists this branch once merged
```

A merged branch is finished work. It reframes everything after it — the next action is cleanup — so settle it first.

**Its PR.** `git remote get-url origin` names the host.

- `github.com`: `gh pr view --json number,state,isDraft,reviewDecision,url` (resolves the current branch).
- `dev.azure.com` or `visualstudio.com`:
  ```bash
  az repos pr list --source-branch <branch> --status all \
    --query '[].{id:pullRequestId,status:status,draft:isDraft,votes:reviewers[].vote}' -o json
  ```
  Votes: `10` approved, `5` approved with suggestions, `-5` waiting for author, `-10` rejected.

**Its issue**, when the branch or the entry names one — `123-`, `#123`, `gh-809`, `issue-809`. GitHub-hosted code keeps its own issues. An Azure remote means code and tracker are split hosts, and `$GH_ISSUE_TRACKER_REPO` names the tracker; that variable is exported per-project and leaks between shells, so honour it only for an Azure-hosted repo. A bare 5-digit Azure work item is a board item to name and leave to the board.

```bash
gh issue view <n> --json number,title,state,comments                     # GitHub-hosted code
gh issue view <n> --repo "$GH_ISSUE_TRACKER_REPO" --json number,title,state,comments   # Azure-hosted code
```

**New commits** on this branch since the entry — someone else's are the reframe to lead with:

```bash
git log --format='%h %an %cr %s' --since='<entry date>'
```

**Unsaved work** — uncommitted files, unpushed commits, and `git stash list`, whose entries are shared by every worktree of the repo:

```bash
git status --short && git log --oneline @{u}.. && git stash list
```

## Answer

One screen, then stop:

> **Saved:** <date> — `Next: …`, or "no closeout entry"
> **Since:** what moved — PR merged, approved, or waiting on you; new commits and who made them; issue closed — or "nothing moved"
> **Verdict:** `Next still holds`, or `Next changed:` and one sentence why
> **Next:** one action, with the command
> **Unsaved:** only when something is

## Handing off

`/catch-up` reports. Each fix has a skill already; name it and stop.

| The check shows | Hand to |
|---|---|
| Branch merged, worktree or finished cards still around | `/clean-workspace` |
| A merged PR whose issue is still open (Azure-hosted code) | `/reconcile-tracker` |
| Done with this work today | `/close` |
| The saved entry points at a session you cannot place | `/find-session` |
