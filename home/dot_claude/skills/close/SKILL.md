---
name: close
description: Close out a session so the next one starts in the right place — commit, notes, and the worktree's Orca card (next step and status), which the SessionStart hook shows every new session; full extras only when a merge, plan docs, or out-of-repo leftovers call for them. Use for /close, "close the session", "wrap up", "end session"; `/close full` runs every extra.
disable-model-invocation: true
---

# /close — session closeout

Quick close runs every time and stays short: a heavy closeout is a closeout that gets skipped. Full extras run only when their trigger is present, or when invoked as `/close full`.

Where things live after a close:

- **This stream's next step** → its Orca worktree card (step 3). Drew reads the sidebar to find his place.
- **Every stream at a glance** → built live at each session start by the `session-start-git-status` hook from the worktrees and their cards. Nothing to write.
- **What happened** → the remember plugin's own history and `SESSION_TAILS.md`, both written automatically.

Global memory (`~/.claude/memory/`) is vault-managed and NOT auto-pushed — after updating it, run `cvault apply` (commit + push) so entries reach the other machines. The git work in step 1 is for the **outer project repo** (e.g. chezmoi, an app repo) — not the vault.

## Quick close — every time

### 1. Commit

```bash
git rev-parse --show-toplevel 2>/dev/null
git status --short
git diff --stat HEAD
```

Not inside a git repo → skip to step 2. Clean tree → say so in one line and move on.

Dirty tree → read the full diff (`git diff HEAD`): hunks, not filenames.

- On `main`, `master`, or `develop`, the work belongs on its stream's branch — the `gate-commit-not-protected` hook hard-blocks commits there. Find the stream with `wt list` and carry the changes over (`git stash -u`, then `git -C <stream-path> stash pop`); with no stream yet, `git switch -c <type>/<topic>` carries them in place.
- Group hunks by **purpose**, not by file. A single file can span two commits; two files can belong to one. One logical change → one commit; don't manufacture splits.
- For each group: state the paths/hunks and the commit message (English imperative, conventional-commit prefix when it fits), confirm with Drew, stage only those paths (`git add -p` when hunks in one file split), commit.
- Do **not** push. Do **not** use `git add -A`.

### 2. Notes — one pass

Read back through the session once for what future work needs:

- **Mistakes** — breakages or corrections not yet in the main checkout's `MISTAKES.md` → append them (what happened / root cause / consequence / prevention, newest first). Never a worktree's copy: it is gitignored and dies with the worktree. Target `"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/MISTAKES.md"`.
- **Decisions, insights, references** worth keeping → the memory file that owns them (table below).
- **Decisions with no durable home yet** — a scope call, a design choice, a deferred question → name the command that gives it one: `/to-spec` or `/re-spec` for a spec, `/to-tickets` or `/re-ticket` for tickets, `/edit-governance` for an ADR or rule. It goes in the card's next step (step 3) when it is the next thing to do.
- **Open tasks** → the card's next step (step 3) or a tracker issue, not memory.

Skip ephemeral debugging steps, retracted ideas, and anything obvious from the diff. Nothing worth keeping is a valid result: say "no notes".

| Content | Destination (`~/.claude/memory/`, the only memory destination; auto-memory is disabled) |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |
| Project-specific learnings | the project's own repo docs (see `projects.md`) |

A new file under `tools/` or `domain/` gets a one-line row (file path + description) in `~/.claude/memory/memory.md`. Live work state belongs in the project's own tracker (for this repo: GitHub issues).

### 3. The card

Run any full-close extras that apply (below) before this step, so their outcome shapes the card.

Inside Orca (`$ORCA_WORKTREE_ID` is set), write this worktree's card. Use `$ORCA_CLI_COMMAND` when set, else `orca`: outside an Orca terminal, bare `orca` on Linux is the GNOME screen reader.

```bash
"${ORCA_CLI_COMMAND:-orca}" worktree set --worktree path:"$(git rev-parse --show-toplevel)" \
  --workspace-status <status> --comment "Next: <first action, naming the branch, PR, or issue>"
```

| Status | When |
|---|---|
| `in-progress` | work remains on this branch |
| `in-review` | a PR is open and waiting on review |
| `completed` | the branch has merged and nothing is left but `wt remove` |

The comment is one line Drew acts on without reading anything else: the skill or command and the first action. Nothing left → `Next: wt remove <branch>`. Outside Orca, print the same `Next:` line instead.

## Full close — only when triggered

Run each extra whose trigger is present. `/close full` runs all of them.

| Trigger | Extra |
|---|---|
| Split-host project (code on Azure, issues on GitHub) and a branch this session worked on has merged | Tracker reconcile |
| The branch being closed has merged | Worktree tidy |
| `.claude/tasks/*.md` or design docs belong to work closed this session | Plan sweep |
| The session made things outside this repo — remote branches, other repos, containers, processes, scratch dirs, comments, files | Leftovers inventory |

### Tracker reconcile

A merged PR does **not** auto-close its issue on a split-host project. Close them per [`_lib/closing-merged-issues.md`](../_lib/closing-merged-issues.md). `merged-set.sh` lists every merged or `[gone]` branch in the repo, so keep only the branches this session worked on. Skip silently on a single-host project, where `Closes #N` already closes the issue.

### Worktree tidy

The normal closeout case is a WIP/unmerged branch — skip this. Only when the branch you're closing out has merged (its Azure PR is `Completed`, or the `GH-N` issue's PR shows merged):

1. **Confirm the merge — don't infer it.** Check the PR state (`az repos pr list`, `gh pr view`) or ask Drew. An Azure-UI merge fires no local hook, so nothing has cleaned up locally.
2. Ensure the `GH-N` issue is closed (tracker reconcile does this on split-host projects).
3. Verify `git status` is clean and **confirm with Drew** — a worktree with uncommitted changes is never removed. Then `wt remove <branch>`, which refuses a branch the default branch does not contain.

### Plan sweep

Implementation plans and completed design docs do not survive task closure (Docs section of the `style` rule). List `.claude/tasks/*.md` and any design docs belonging to work closed this session. For each: fold durable outcomes into CHANGELOG/ADR/execution summary first, then propose deletion and confirm per file. Plans for still-open work stay untouched.

### Leftovers inventory

List everything this session created, changed, or started outside the commits — branches (local and remote), worktrees, PRs, issues, comments it wrote, files outside the repo, scratch dirs, processes, containers. Check each one **live** (remote, tracker, filesystem, `docker ps`), never from memory, and sort it:

- **Landed** — merged, closed, released, verified on the remote.
- **In flight** — waiting on review, CI, a pipeline, or a person; name who or what.
- **Debris** — a branch after its merge, a leftover worktree, a temp file or container, a stale comment this session wrote.
- **Out of scope** — a finding that deserves its own tracker issue. Draft the title and one-paragraph body now, while the context is live; file it on confirm.

Report the sorted list with one proposed action per item and act only on what Drew confirms. Worktree removal is `wt remove <branch>`; branch deletion follows the `deletion-safety` rule.

## Report

Print the counter:

```
<N> memory updates · <N> commits · <N> issues closed · <N> issues filed · card set · worktree removed
```

Drop any segment whose step didn't run rather than printing `0`. Then the card's `Next:` line, and last a `/rename <project>-<ticket-or-pr>-<topic>` command Drew can paste (kebab-case, no date, no status words) so `/resume` and `/find-session` can find the session.

## Self-check before reporting done

- Every new memory file has a one-line pointer in `memory.md`.
- Counter line reflects actual counts, not aspirational ones.
- Inside Orca, the card's comment is this session's `Next:` line, word for word.
- If the session touched vault or chezmoi source: both repos clean and pushed.
