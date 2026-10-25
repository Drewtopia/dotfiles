---
name: catch-up
description: Re-entry briefing for the branch you're standing in — starts from the last status line a session left in this worktree, checks what could have made it stale, and says whether it still holds. Use for /catch-up, or when returning to a worktree after a day or more away.
disable-model-invocation: true
---

# Catch up

Re-entry for the branch under your feet. The last session here already wrote down where this work stopped; this checks whether that is still true.

## 1. What was saved

```bash
git rev-parse --show-toplevel && git branch --show-current
git log -1 --format='%h %cr %s'
```

Read the newest entry the `open-loops` mod saved for a session in this worktree: one JSON file per session, with `kind` (`waiting`, `parked`, `done`), `text`, and `at` in epoch milliseconds.

```bash
grep -l "\"cwd\":\"$(git rev-parse --show-toplevel)" ~/.claude/open-loops/*.json | xargs -r ls -t | head -1 | xargs -r cat
```

No entry → older branches keep their next step elsewhere. Read the worktree's Orca card comment (`"${ORCA_CLI_COMMAND:-orca}" worktree current --json`, `.result.worktree.comment`; outside an Orca terminal, bare `orca` on Linux is the GNOME screen reader), else the newest `~/.claude/memory/SESSION_LOG.md` entry whose `- Branch:` line matches exactly.

Nothing found → say so, and build "Saved" from this branch's `git log` alone.

Quote the saved date and line verbatim. Everything below tests it.

## 2. What could have moved since

Measure from the saved date, or the last commit when nothing was saved. Prefix each network call with `timeout 40`: a stalled host costs one line of the answer ("couldn't reach az"), never a guess.

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

**Its issue**, when the branch or the saved line names one — `123-`, `#123`, `gh-809`, `issue-809`. GitHub-hosted code keeps its own issues. An Azure remote means code and tracker are split hosts, and `$GH_ISSUE_TRACKER_REPO` names the tracker; that variable is exported per-project and leaks between shells, so honour it only for an Azure-hosted repo. A bare 5-digit Azure work item is a board item to name and leave to the board.

```bash
gh issue view <n> --json number,title,state,comments                     # GitHub-hosted code
gh issue view <n> --repo "$GH_ISSUE_TRACKER_REPO" --json number,title,state,comments   # Azure-hosted code
```

**New commits** on this branch since the saved date — someone else's are the reframe to lead with:

```bash
git log --format='%h %an %cr %s' --since='<saved date>'
```

**Unsaved work** — uncommitted files, unpushed commits, and `git stash list`, whose entries are shared by every worktree of the repo:

```bash
git status --short && git log --oneline @{u}.. && git stash list
```

## Answer

One screen, then stop:

> **Saved:** <date> — the saved line, or "nothing saved"
> **Since:** what moved — PR merged, approved, or waiting on you; new commits and who made them; issue closed — or "nothing moved"
> **Verdict:** `Saved line still holds`, or `Saved line changed:` and one sentence why
> **Unsaved:** only when something is

The last line is the status line, naming one action with its command: `Parked: <action>`, or `Waiting on you: <ask>`.

## Handing off

`/catch-up` reports. Each fix has a skill already; name it and stop.

| The check shows | Hand to |
|---|---|
| Branch merged, worktree still around | `wt remove <branch>` |
| A merged PR whose issue is still open (Azure-hosted code) | `/reconcile-tracker` |
| Done with this work today | `/close` |
| The saved line points at a session you cannot place | `/find-session` |
