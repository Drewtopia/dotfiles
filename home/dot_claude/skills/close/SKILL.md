---
name: close
description: Close out a session — memory updates, tracker reconcile, commits split by purpose, merged-worktree tidy, SESSION_LOG.md, session-leftover inventory, rename and color-status commands, next-session prompt. Use for /close, "close the session", "wrap up", "end session".
disable-model-invocation: true
---

# /close — session closeout

Three phases. Run them in order. End with a counter line, then `/rename` and `/color` commands.

Global memory (`~/.claude/memory/`) is vault-managed and NOT auto-pushed — after updating it, run `cvault apply` (commit + push) so entries reach the other machines. Phase 2's git work is for the **outer project repo** (e.g. chezmoi, an app repo) — not the vault.

## Phase 1 — Retrospective

### 1. Scan context

Read back through the session and account for **every** candidate in the five categories below —
each one either written to a memory file or named out loud as skipped. Report the tally
(`<N> found · <N> written · <N> skipped`) with a reason beside each skip. Saying "nothing else"
silently is how a retrospective ends early; the skip has to be spoken.

- **Decisions** — choices made that shape future work (architectural, taxonomic, naming).
- **Insights / inefficiencies** — patterns spotted, surprises, things slower than expected.
- **Open tasks** — work named but not finished.
- **References** — external URLs, doc paths, dashboards, channels worth remembering.
- **Mistakes** — breakages or corrections this session not yet in the repo's `MISTAKES.md` → append them now (what happened / root cause / consequence / prevention, newest first).

Skip ephemeral debugging steps, retracted ideas, and anything already obvious from the diff.

### 2. Update memory files

**Global memory** — `~/.claude/memory/` (the only memory destination; auto-memory is disabled)

| Content | Destination |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |
| Project-specific learnings | the project's own repo docs (see `projects.md`) |

When you create a new file under `tools/` or `domain/`, add a one-line entry to `~/.claude/memory/memory.md` (the global index): a row with file path + description.

**Live state** — memory holds durable shapes and gotchas. Live work state belongs in the project's own tracker (for this repo: GitHub issues).

**Reconcile the tracker** — on split-host projects (code on Azure, issues on GitHub) a merged PR does **not** auto-close its issue. Close them per [`_lib/closing-merged-issues.md`](../_lib/closing-merged-issues.md), reaching only as far as this session's branches (`merged-set.sh`). Skip silently if the project is single-host.

## Phase 2 — Housekeeping

### 1. Locate the project repo

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If not inside a git repo, skip the rest of Phase 2 and go to Phase 3 (SESSION_LOG fallback to `~/SESSION_LOG.md`).

### 2. Inspect changes

```bash
git status --short
git diff --stat HEAD
git diff HEAD
```

Read the full diff. Don't just look at filenames — read hunks.

### 3. Get off protected branches

If HEAD is on `main`, `master`, or `develop`, cut a feature branch before committing — the `gate-commit-not-protected` hook hard-blocks commits there:

```bash
git checkout -b <type>/<topic>   # Conventional Branch name, e.g. chore/session-closeout
```

### 4. Split the diff into logical commits

Group hunks by **purpose**, not by file. A single file can span two commits; two files can belong to the same commit.

For each proposed group:

1. State the group: which paths/hunks, and the commit message (English imperative, conventional-commit prefix when it fits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
2. Ask Drew to confirm before staging.
3. On confirm: stage only the relevant paths. If hunks within a file split across commits, use `git add -p` and select.
4. Commit.

Do **not** push. Do **not** use `git add -A`.

If the diff is genuinely one logical change, propose a single commit — don't manufacture splits.

### 5. Post-merge cleanup (only if this branch's PR has already merged)

The normal closeout case is a WIP/unmerged branch — **skip this whole step** for that. Only when the branch you're closing out has already merged (its Azure PR is `Completed`, or the `GH-N` issue's PR shows merged):

1. **Confirm the merge — don't infer it.** Check the PR state (`az repos pr list`) or ask Drew. worktrunk has no post-merge hook, and an Azure-UI merge never fires one, so nothing has cleaned up locally.
2. Ensure the `GH-N` issue is closed (Phase 1 reconcile already does this).
3. Verify `git status` is clean and **confirm with Drew** — a worktree with uncommitted changes is never removed. Then hand the removal to `clean-workspace`'s worktree step, which owns it for every caller: its dirty-tree refusal and no-`wt` fallback apply to this single branch exactly as they do to a bulk prune.

### 6. Plan/design sweep (documentation-policy lifecycle)

Implementation plans and completed design docs do not survive task closure. List `.claude/tasks/*.md` and any design docs belonging to work closed this session. For each: fold durable outcomes into CHANGELOG/ADR/execution summary first, then propose deletion and confirm per file. Plans for still-open work stay untouched.

### 7. SESSION_LOG.md (cross-device)

The SESSION_LOG entry is written in **Phase 3 §4**, once the leftovers inventory (§1) and the `Next:` line (§3) are known — the entry carries that `Next:` line so the reckoning board and the next session can read it. The file lives in the vault; after writing it, `cvault apply` pushes it so entries reach all of Drew's machines.

## Phase 3 — Close

### 1. Inventory what the session left behind

Runs after Phase 2 so its commits and cleanup show up. List everything this session created, changed, or started — branches (local and remote), worktrees, PRs, issues, comments it wrote, files outside the repo, scratch dirs, processes, containers. Check each one **live** (remote, tracker, filesystem, `docker ps`), never from memory, and sort it:

- **Landed** — merged, closed, released, verified on the remote.
- **In flight** — waiting on review, CI, a pipeline, or a person; name who or what.
- **Debris** — a branch after its merge, a leftover worktree, a temp file or container, a stale comment this session wrote.
- **Out of scope** — a finding that deserves its own tracker issue. Draft the title and one-paragraph body now, while the context is live; file it on confirm.

Report the sorted list with one proposed action per item and act only on what Drew confirms. Decisions go through Phase 1 step 1, not here. Worktree removal goes to `clean-workspace`'s worktree step; branch deletion follows the `deletion-safety` rule.

### 2. Compose the rename and color commands

Compose two commands from the §1 inventory. Drew pastes them at the prompt; the agent cannot run slash commands itself. They are printed as the report's last two lines, after the §5 counter, so they are not lost mid-report:

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

Nothing open defaults to `pink`; use `green` only when the session holds context worth returning to or Drew asks to keep it. `purple` and `cyan` stay unassigned.

### 3. Print next-session prompt

If anything is in flight or open, print on its own line, prefixed `Next:`, a prompt Drew can paste into a fresh session — the first action and the skill to call:

```
Next: <skill or command> — <first action, naming the branch, PR, or issue>
```

Skip the line when nothing is left open.

### 4. Write SESSION_LOG.md

Now prepend the entry — the leftovers (§1) and the `Next:` line (§3) are known. The helper owns the format, derives date/machine/project, and refuses an empty required field:

```bash
bash ~/.claude/skills/_lib/session-log-prepend.sh \
  --title "<title>" \
  --summary "<1–2 sentences on what got done and why it mattered>" \
  --artifact "<path, PR link, or skill name>" \
  --next "<the §3 Next: line>"
```

Pass `--next` with the §3 line so the entry carries it; omit `--next` when §3 was skipped. Creates `SESSION_LOG.md` if absent. Then `cvault apply` to push it.

### 5. Print closing counter

```
<N> memory updates · <N> commits · <N> issues closed · <N> issues filed · worktree removed · SESSION_LOG updated
```

If a step was skipped (e.g. no git repo, no merge to clean up), drop that segment from the line rather than printing `0`.

Then print the §2 `/rename` and `/color` commands as the last two lines of the report, each on its own line, with nothing after them.

## Self-check before reporting done

- Every new memory file has a one-line pointer in `memory.md`.
- Counter line reflects actual counts, not aspirational ones.
- Governance unlock cleared: `~/.claude/governance-unlock/` is empty or stale.
- If the session touched vault or chezmoi source: both repos clean and pushed.
