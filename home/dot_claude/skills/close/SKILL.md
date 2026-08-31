---
name: close
description: Close out a session — memory updates, tracker reconcile, commits split by purpose, merged-worktree tidy, SESSION_LOG.md, rename suggestion. Use for /close, "close the session", "wrap up", "end session".
disable-model-invocation: true
---

# /close — session closeout

Three phases. Run them in order. Print a counter line at the end.

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

If not inside a git repo, skip to step 7 (SESSION_LOG fallback to `~/SESSION_LOG.md`).

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

Prepend to `~/.claude/memory/SESSION_LOG.md`. This file lives in the vault; after writing it, `cvault apply` pushes it so entries reach all of Drew's machines.

The helper owns the entry format. It derives date, machine and project, and refuses on an empty
field — hand-typing those three is how the log ended up with two spellings of one machine:

```bash
bash ~/.claude/skills/_lib/session-log-prepend.sh \
  --title "<title>" \
  --summary "<1–2 sentences on what got done and why it mattered>" \
  --artifact "<path, PR link, or skill name>"
```

If `SESSION_LOG.md` doesn't exist yet, the prepend creates it.

## Phase 3 — Close

### 1. Print rename suggestion

Print on its own line, prefixed `Rename:` so Drew can copy it directly into the session-name field:

```
Rename: [YYYY-MM-DD] <project-or-topic> — <what-was-done>
```

`<what-was-done>` should be one short noun phrase, not a sentence (e.g. `built /close skill`, not `today I built the /close skill`).

### 2. Print closing counter

```
<N> memory updates · <N> commits · <N> issues closed · worktree removed · SESSION_LOG updated
```

If a step was skipped (e.g. no git repo, no merge to clean up), drop that segment from the line rather than printing `0`.

## Self-check before reporting done

- Every new memory file has a one-line pointer in `memory.md`.
- Counter line reflects actual counts, not aspirational ones.
- Governance unlock cleared: `~/.claude/governance-unlock/` is empty or stale.
- If the session touched vault or chezmoi source: both repos clean and pushed.
