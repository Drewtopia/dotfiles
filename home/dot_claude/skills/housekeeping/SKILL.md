---
name: housekeeping
description: Map of the session and cleanup skills, ordered by where you are in the work — coming back to a branch, a crowded agents view, ending a session, after a merge, a lost session, a drifted tracker. Use when the right skill isn't obvious, or the user asks what exists.
---

# Housekeeping

Which skill, by where you are in the work. This file routes; it does not run the work. Every skill below is user-invoked — name the right one and hand it over.

## The loop these serve

One issue → `wtc <branch>` (worktree, tmux session, claude) → work, committing each finished piece → PR → `/close` → merge → `wtr <branch>`. Commits save the code; the reasoning behind it lives only in the conversation until it is written into the issue. So keep one session while commits build on the same discussion, and `/clear` at a task boundary: after `/close`, or after posting the plan or progress to the issue.

## Closing the loop

Work stalls after the code is done: it waits on review, then nothing cleans up after the merge.

**One number ties it together.** Carry the issue or work-item number through everything: issue `#42` → branch `feat/42-slug` → PR (`Closes #42` on GitHub; on Azure Repos, link the work item and name a GitHub tracker issue `GH-42`) → the `/close` session name `<project>-42-slug`. The agents view shows each session's PR and its status; `wt list` shows each worktree's PR and marks merged branches `⊂` or `_`.

**What is waiting on review or merge:**

```bash
gh search prs --author @me --state open               # GitHub, every repo
az repos pr list --creator <you> --status active      # Azure Repos, current project
```

`/close` colors those sessions `orange` (waiting on someone else) or `yellow` (waiting on you to merge).

**After a merge:** `wtc` prints how many merged worktrees and branches can go; `wt step prune --dry-run` lists them, including squash merges. `/clean-workspace` removes them and clears finished cards. On a split-host project (code on Azure, issues on GitHub) a merge does not close the issue — run `/reconcile-tracker`.

## By stage

| Where you are | Reach for |
|---|---|
| Back in a worktree after a day or more away | **`/catch-up`** — its last `Next:` line, what moved since, whether it still holds |
| The agents view is crowded and you can't tell what's open | **`/reach-out`** — the sessions nobody closed report a color and a `Next:` line |
| About to clear or compact a long session | **`/flow-check`** — captures what the session decided, left open or built onto the tracker, then routes each thread through ask-matt |
| Ending a session, finished or not | **`/close`** — quick by default; `/close full` after a merge or when work leaked outside the repo |
| One branch merged | `wtr <branch>` removes its worktree and tmux session |
| Finished cards and merged worktrees piling up | **`/clean-workspace`** — prunes merged worktrees, clears done cards on confirmation |
| A past session is lost, or a card was cleared by mistake | **`/find-session <memory>`** searches transcript text; `claude --resume <name>` when you know its name |
| Merged work on Azure-hosted code whose issues are still open | **`/reconcile-tracker`** — walks merged PRs to close what they closed |
| The whole work backlog has drifted — ghosts, inflated counts, planless tickets | **`/realign-tracker`** — sweeps every open issue; slower, run periodically |

Not every skill is installed on every machine — `/realign-tracker` lives only on the work machine. Check `ls ~/.claude/skills/<name>` before naming one.

`/catch-up` and `/reach-out` differ by **anchor**: `/catch-up` starts from the branch you are standing in and the `Next:` line it saved; `/reach-out` starts from the sessions that never saved one.

The two tracker skills differ by **reach**: `/reconcile-tracker` starts from merged work and closes the issues behind it, `/realign-tracker` starts from every open issue and checks it for drift. `/close` reconciles only the branches of the session it is closing.
