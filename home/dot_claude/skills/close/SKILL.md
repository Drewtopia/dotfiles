---
name: close
description: Close out a session — quick by default (commit, notes, SESSION_LOG with a Next line, rename and color-status commands); full extras only when a merge, plan docs, or out-of-repo leftovers call for them. Use for /close, "close the session", "wrap up", "end session"; `/close full` runs every extra.
disable-model-invocation: true
---

# /close — session closeout

Quick close runs every time and stays short: a heavy closeout is a closeout that gets skipped. Full extras run only when their trigger is present, or when invoked as `/close full`. End with a counter line, then `/rename` and `/color` commands.

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

- On `main`, `master`, or `develop`, cut a feature branch first — the `gate-commit-not-protected` hook hard-blocks commits there: `git checkout -b <type>/<topic>` (Conventional Branch name, e.g. `chore/session-closeout`).
- Group hunks by **purpose**, not by file. A single file can span two commits; two files can belong to one. One logical change → one commit; don't manufacture splits.
- For each group: state the paths/hunks and the commit message (English imperative, conventional-commit prefix when it fits), confirm with Drew, stage only those paths (`git add -p` when hunks in one file split), commit.
- Do **not** push. Do **not** use `git add -A`.

### 2. Notes — one pass

Read back through the session once for what future work needs:

- **Mistakes** — breakages or corrections not yet in the main checkout's `MISTAKES.md` → append them (what happened / root cause / consequence / prevention, newest first). Never a worktree's copy: it is gitignored and dies with the worktree. Target `"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/MISTAKES.md"`.
- **Decisions, insights, references** worth keeping → the memory file that owns them (table below).
- **Open tasks** → the `Next:` line (step 3) or a tracker issue, not memory.

Skip ephemeral debugging steps, retracted ideas, and anything obvious from the diff. Nothing worth keeping is a valid result: say "no notes".

| Content | Destination (`~/.claude/memory/`, the only memory destination; auto-memory is disabled) |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |
| Project-specific learnings | the project's own repo docs (see `projects.md`) |

A new file under `tools/` or `domain/` gets a one-line row (file path + description) in `~/.claude/memory/memory.md`. Live work state belongs in the project's own tracker (for this repo: GitHub issues).

### 3. Rename and color

Run any full-close extras that apply (below) before this step, so their outcome shapes the status and the `Next:` line.

Decide the session's name and color now: the SESSION_LOG entry in step 4 records both. Compose them as two commands. Drew pastes them at the prompt; the agent cannot run slash commands itself. They are the report's last two lines, after the counter, so they are not lost mid-report:

```
/rename <project>-<ticket-or-pr>-<topic>
/color <status-color>
```

**Name** — kebab-case, lowercase, no date (the `/resume` picker shows recency). Name the session by everything it did, not just its opening ask. Lead with the project, then a ticket, PR, or branch number when there is one — those are what Drew searches for. Keep status words (`wip`, `done`) out of the name; the color carries status. Examples: `at-59806-seed-ledger-migration`, `dotfiles-gh-156-close-rename-line`.

**Color** — the session's status, tinting its name in the agents view. Take the first row that applies:

| Color | Status |
|---|---|
| `red` | broken or blocked on an unresolved failure |
| `yellow` | waiting on Drew — a decision, manual step, merge, or apply |
| `orange` | waiting on someone else — review, CI, QA |
| `blue` | parked mid-work, to resume later |
| `green` | done, kept — reference material or a likely follow-up |
| `pink` | done and closed out — nothing in flight, safe to remove |

Nothing open defaults to `pink`; use `green` only when the session holds context worth returning to or Drew asks to keep it. `purple` and `cyan` stay unassigned. A `pink` session's card is what `/clean-workspace` clears, which keeps the agents view short.

### 4. Next line and SESSION_LOG

If anything is in flight or open, print on its own line a prompt Drew can paste into a fresh session — the first action and the skill to call:

```
Next: <skill or command> — <first action, naming the branch, PR, or issue>
```

Skip the line when nothing is left open.

Prepend the SESSION_LOG entry. The helper owns the format, derives date, machine, project and branch, writes the `Next: ` prefix itself, and refuses an empty required field or an unknown color:

```bash
bash ~/.claude/skills/_lib/session-log-prepend.sh \
  --title "<title>" \
  --summary "<1–2 sentences on what got done and why it mattered>" \
  --artifact "<path, PR link, or skill name>" \
  --next "<the Next line's text, without the Next: prefix>" \
  --name "<the /rename name from step 3>" \
  --color "<the /color word from step 3>"
```

Omit `--next` when there is no Next line. Run it from the repo or worktree the session worked in, so the derived branch is the right one. Creates `SESSION_LOG.md` if absent. Then `cvault apply` to push it.

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

1. **Confirm the merge — don't infer it.** Check the PR state (`az repos pr list`, `gh pr view`) or ask Drew. worktrunk has no post-merge hook, and an Azure-UI merge never fires one, so nothing has cleaned up locally.
2. Ensure the `GH-N` issue is closed (tracker reconcile does this on split-host projects).
3. Verify `git status` is clean and **confirm with Drew** — a worktree with uncommitted changes is never removed. Then hand the removal to `clean-workspace`'s worktree step, which owns it for every caller: its dirty-tree refusal and no-`wt` fallback apply to this single branch exactly as they do to a bulk prune.

### Plan sweep

Implementation plans and completed design docs do not survive task closure (Docs section of the `style` rule). List `.claude/tasks/*.md` and any design docs belonging to work closed this session. For each: fold durable outcomes into CHANGELOG/ADR/execution summary first, then propose deletion and confirm per file. Plans for still-open work stay untouched.

### Leftovers inventory

List everything this session created, changed, or started outside the commits — branches (local and remote), worktrees, PRs, issues, comments it wrote, files outside the repo, scratch dirs, processes, containers. Check each one **live** (remote, tracker, filesystem, `docker ps`), never from memory, and sort it:

- **Landed** — merged, closed, released, verified on the remote.
- **In flight** — waiting on review, CI, a pipeline, or a person; name who or what.
- **Debris** — a branch after its merge, a leftover worktree, a temp file or container, a stale comment this session wrote.
- **Out of scope** — a finding that deserves its own tracker issue. Draft the title and one-paragraph body now, while the context is live; file it on confirm.

Report the sorted list with one proposed action per item and act only on what Drew confirms. Worktree removal goes to `clean-workspace`'s worktree step; branch deletion follows the `deletion-safety` rule.

## Report

Print the counter:

```
<N> memory updates · <N> commits · <N> issues closed · <N> issues filed · worktree removed · SESSION_LOG updated
```

Drop any segment whose step didn't run rather than printing `0`. Then the `/rename` and `/color` commands as the last two lines, each on its own line, with nothing after them.

## Self-check before reporting done

- Every new memory file has a one-line pointer in `memory.md`.
- Counter line reflects actual counts, not aspirational ones.
- If the session touched vault or chezmoi source: both repos clean and pushed.
