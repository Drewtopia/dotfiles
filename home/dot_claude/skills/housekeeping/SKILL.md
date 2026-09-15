---
name: housekeeping
description: Map of the session and cleanup skills, ordered by where you are in the work — coming back to a branch, a crowded agents view, ending a session, after a merge, a lost session, a drifted tracker. Use when the right skill isn't obvious, or the user asks what exists.
---

# Housekeeping

Which skill, by where you are in the work. This file routes; it does not run the work. Every skill below is user-invoked — name the right one and hand it over.

## The loop these serve

One issue → `wtc <branch>` (worktree, tmux session, claude) → work, commit, `/clear`, repeat → PR → `/close` → merge → `wtr <branch>`. A session is scratch; the issue, the commits, the PR and the SESSION_LOG `Next:` line carry the work, so clearing after a commit loses nothing.

## By stage

| Where you are | Reach for |
|---|---|
| Back in a worktree after a day or more away | **`/catch-up`** — its last `Next:` line, what moved since, whether it still holds |
| The agents view is crowded and you can't tell what's open | **`/reach-out`** — the sessions nobody closed report a color and a `Next:` line |
| Ending a session, finished or not | **`/close`** — quick by default; `/close full` after a merge or when work leaked outside the repo |
| One branch merged | `wtr <branch>` removes its worktree and tmux session |
| Finished cards and merged worktrees piling up | **`/clean-workspace`** — prunes merged worktrees, clears done cards on confirmation |
| A past session is lost, or a card was cleared by mistake | **`/find-session <memory>`** searches transcript text; `claude --resume <name>` when you know its name |
| Merged work on Azure-hosted code whose issues are still open | **`/reconcile-tracker`** — walks merged PRs to close what they closed |
| The whole work backlog has drifted — ghosts, inflated counts, planless tickets | **`/realign-tracker`** — sweeps every open issue; slower, run periodically |

Not every skill is installed on every machine — `/realign-tracker` lives only on the work machine. Check `ls ~/.claude/skills/<name>` before naming one.

`/catch-up` and `/reach-out` differ by **anchor**: `/catch-up` starts from the branch you are standing in and the `Next:` line it saved; `/reach-out` starts from the sessions that never saved one.

The two tracker skills differ by **reach**: `/reconcile-tracker` starts from merged work and closes the issues behind it, `/realign-tracker` starts from every open issue and checks it for drift. `/close` reconciles only the branches of the session it is closing.
