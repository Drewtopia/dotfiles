---
name: catch-up
description: Re-entry briefing for one repo — the window you were away, what moved inside it, one next action. Use for /catch-up, or when returning to work whose thread is lost.
disable-model-invocation: true
---

# Catch up

Re-entry. Days passed, the repo moved, and the thread is lost. Rebuild it for one repo.

`/whats-next` triages every session on the machine to pick one to walk into. This starts from
the repo under your feet and asks what happened to *this* work.

## The window

The window is the span the reader was away. Every finding below is measured inside it, so open
it first.

```bash
git log -1 --format='%h %cr %s'      # their last commit here
```

Floor the window at two days. A sibling session sharing this checkout fast-forwards the branch,
which collapses "since my last commit" to minutes and hides the very days being asked about —
the reader's absence is the truth, the branch's mtime is an artefact.

## Gather

Azure Repos holds the PR records and GitHub holds the issues; read each from its host. A
`Merged PR 9342:` subject in the log is a side effect of the merge — blind to votes, to drafts,
and to everything still open.

**Trunk, and whether this branch is still work.** Trunk comes from `origin/HEAD`, else
`develop`/`main`/`master`.

```bash
git fetch --prune origin
git rev-list --left-right --count origin/<trunk>...HEAD          # behind / ahead
git branch --merged origin/<trunk> --format='%(refname:short)'   # contains theirs?
```

A merged branch is finished work rather than work in progress. It reframes everything after it,
so settle it first.

**What landed, and what is still in flight.** `git remote get-url origin` names the host:
`dev.azure.com` or `visualstudio.com` for the commands below, `github.com` for
`gh pr list --state merged --limit 40` and `gh pr list --state open`, whose `reviewDecision`
stands in for the vote table.

```bash
az repos pr list --status completed --target-branch <trunk> --top 40 \
  --query '[].{id:pullRequestId,closed:closedDate,by:createdBy.displayName,title:title}' -o tsv
az repos pr list --status active \
  --query '[].{id:pullRequestId,src:sourceRefName,draft:isDraft,title:title,votes:reviewers[].vote}' -o json
```

Keep the completed PRs whose `closedDate` sits inside the window. Read every active PR in the
repo — an open PR on a branch the reader has forgotten is exactly what re-entry exists to
surface. Votes: `10` approved, `5` approved with suggestions, `-5` waiting for author, `-10`
rejected.

When a PR carries votes, read its human threads — `system` threads are vote and policy noise:

```bash
az repos pr show --id <id> --query 'repository.{id:id,project:project.name}' -o tsv
az devops invoke --area git --resource pullRequestThreads --api-version 7.1 \
  --route-parameters project=<project> repositoryId=<repoId> pullRequestId=<id> -o json |
  jq -r '.value[] | select(.comments[0].commentType != "system")
         | "[\(.status // "active")] \(.comments[0].author.displayName): \(.comments[0].content)"'
```

**Their own parked branches**, most recent first:

```bash
git for-each-ref --sort=-committerdate refs/heads --no-merged origin/<trunk> \
  --format='%(committerdate:relative)  %(refname:short)  %(contents:subject)'
```

**Sessions standing on this repo** — a session belongs here when its `cwd` is the repo root or
shares its `git rev-parse --git-common-dir`, which is what catches the worktrees.

```bash
claude agents --json --all | jq -r '(if type=="array" then . else .agents end)[]
  | [(.kind // "-"), (.id // "-"), (.state // "-"), (.name // "unnamed"), (.cwd // "-")] | @tsv'
```

`~/.claude/jobs/<id>/state.json` holds each card's `detail`: for a blocked card the literal
question it asked, for a done card the result it produced. Quote them — re-deriving one wastes
the days it already spent waiting. A session on the reader's own branch is the goalpost-mover:
name it first, with the branch and dirty count of the tree it sits in. Name eight; count the
rest.

**The issue, when the branch names one** — `123-`, `#123`, `gh-809`, `issue-809`, or a bare
5-digit Azure work item, which is a board item to name and leave to the board. Issues live
beside the code on a GitHub remote; an Azure remote means the code and the tracker are split
hosts, and `$GH_ISSUE_TRACKER_REPO` names the tracker. That variable is exported per-project
and leaks between shells, so honour it only for an Azure-hosted repo — a GitHub repo owns its
own issues.

```bash
gh issue view <n> --json number,title,state,labels,comments          # GitHub-hosted code
gh issue view <n> --repo "$GH_ISSUE_TRACKER_REPO" --json ...         # Azure-hosted code
```

**Unsaved work** — uncommitted files, unpushed commits, and `git stash list`, whose entries are
shared by every worktree of the repo, worth saying when reporting them from inside one.

```bash
git status --short && git log --oneline @{u}.. && git stash list
```

Every block ends in a fact or in the reason you could not get one — an unreachable daemon, a
missing `az`, an unset `GH_ISSUE_TRACKER_REPO`. An unknown block stays unknown. Prefix each
network call with `timeout 40`: a stalled host costs one line of the briefing, never the
briefing.

## Answer

A pile of state defeated the reader once already. Give them prose in this shape — one screen,
cutting the **Then** list first when it runs longer — then stop:

> **You were:** one sentence — what this branch is for, idle N days
> **Since then:** what moved — merged PRs by name, who else touched this branch — or
> "nothing moved", and stop there
> **Unsaved:** only when something is
> **Next:** one action, with the command
> **Then:** at most three more, one line each

Lead with the reframe when there is one: the branch already merged, a PR waiting on the reader,
a sibling session mid-flight on their branch. Those change what they do next.

## Handing off

Each fix has a skill already; name it and stop there. `/catch-up` reports.

| The gather shows | Hand to |
|---|---|
| Several sessions on their branch or in their checkout | `/reconcile-sessions` |
| Finished cards, merged worktrees, branches long gone | `/clean-workspace` |
| A merged PR whose issue is still open | `/reconcile-tracker` |
| They are done with this work today | `/close` |
| A session in the roster they cannot place | `/find-session` |
