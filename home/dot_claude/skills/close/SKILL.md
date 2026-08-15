---
name: close
description: Close out a session — memory updates, tracker reconcile, commits split by purpose, merged-worktree tidy, SESSION_LOG.md, rename suggestion. Use for /close, "close the session", "wrap up", "end session".
---

# /close — session closeout

Three phases. Run them in order. Print a counter line at the end.

Global memory (`~/.claude/memory/`) is vault-managed and NOT auto-pushed — after updating it, run `cvault apply` (commit + push) so entries reach the other machines. Project auto-memory (`~/.claude/projects/<repo>/memory/`) is machine-local — nothing to push. Phase 2's git work is for the **outer project repo** (e.g. chezmoi, an app repo) — not the vault.

## Phase 1 — Retrospective

### 1. Scan context

Read back through the session and pull out only what's worth persisting:

- **Decisions** — choices made that shape future work (architectural, taxonomic, naming).
- **Insights / inefficiencies** — patterns spotted, surprises, things slower than expected.
- **Open tasks** — work named but not finished.
- **References** — external URLs, doc paths, dashboards, channels worth remembering.

Skip ephemeral debugging steps, retracted ideas, and anything already obvious from the diff.

### 2. Update memory files

Two destinations: global (Drew's hand-curated scheme) and project (Claude Code auto-memory).

**Global memory** — `~/.claude/memory/`

Drew's memory follows the structure documented in his `~/.claude/CLAUDE.md` (YoungLeaders / Pawel Huryn scheme):

| Content | Destination |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |

When you create a new file under `tools/` or `domain/`, add a one-line entry to `~/.claude/memory/memory.md` (the global index). Format: a row in the index table with file path, description, last-updated date. Entry shape (per the global rules): `date — what — why`. Nothing more.

**Project memory** — `~/.claude/projects/<repo>/memory/`

Claude Code's auto-memory (official; on by default). Scoped by **git repository** — every worktree and subdirectory of this repo shares one directory (not per-cwd), and it is **machine-local** (not pushed to the vault). A `MEMORY.md` **index** (loaded every session — first 200 lines / 25KB) plus on-demand **topic files**.

Write project-specific learnings — active tickets, repo-specific patterns, decisions tied to this codebase — as topic files (one topic per file, plain descriptive name), then add a one-line pointer to `MEMORY.md`. Keep the index lean: move detail out to topic files, never collapse topic files back into the index. Don't hand-write frontmatter — Claude Code manages the `modified` timestamp itself; adding `type`/`name`/`description` fields is a local convention, not a requirement.

**Project live state** — do not maintain a live-state digest in memory. Work state belongs in the project's own tracker (for this repo: GitHub issues). Never start or update a memory `CURRENT-STATE.md` or committed `STATUS.md`/`STATE-MAP.md` — those are retired patterns. `MEMORY.md` holds durable shapes and gotchas only, not live status.

**Reconcile the tracker** — where the code host and the issue tracker differ (this repo: code on Azure, issues on GitHub), a merged PR does **not** auto-close its issue. As part of closeout, for each branch worked this session whose PR has merged, close the `GH-N` issue its PR body/commits reference: `gh issue close <N> --repo "$GH_ISSUE_TRACKER_REPO"`. This mirrors the sandcastle `reconcile()` pass, which only covers `agent/*` branches — manual branches need this closer. Skip silently if the project is single-host (PR merge already closes the issue).

## Phase 2 — Housekeeping

### 1. Locate the project repo

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If not inside a git repo, skip to step 6 (SESSION_LOG fallback to `~/SESSION_LOG.md`).

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
3. Verify `git status` is clean — **never** remove a worktree with uncommitted changes. Confirm with Drew, then from inside the worktree run `wt remove` — it removes the worktree and deletes the branch since it's merged.

### 6. SESSION_LOG.md (cross-device)

Prepend to `~/.claude/memory/SESSION_LOG.md`. This file lives in the vault; after writing it, `cvault apply` pushes it so entries reach all of Drew's machines.

Entry format:

```
## YYYY-MM-DD — <title>

<1–2 sentence summary of what got done and why it mattered>

- Machine: <hostname>
- Project: <git repo name, or absolute cwd if not in a repo>
- Main artifact: <path, PR link, or skill name>
```

Atomic prepend:

```bash
LOG=~/.claude/memory/SESSION_LOG.md
ENTRY="$(cat <<EOF
## $(date +%Y-%m-%d) — <title>

<summary>

- Machine: $(hostname -s)
- Project: <name>
- Main artifact: <path>
EOF
)"
{ printf "%s\n\n" "$ENTRY"; cat "$LOG" 2>/dev/null || true; } > "$LOG.tmp"
mv "$LOG.tmp" "$LOG"
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

- Every new memory file has a one-line pointer in its index (`memory.md` for global, `MEMORY.md` for project).
- No `git push`. No staging with `-A`.
- A worktree was only removed after confirming its PR merged and `git status` was clean.
- SESSION_LOG entry is at the **top** of the file (newest first).
- Counter line reflects actual counts, not aspirational ones.
