---
name: close
description: Close out a Claude Code session — capture relevant thoughts to Open Brain, update memory files, propose git commits split by purpose, write SESSION_LOG.md, and print a rename suggestion. Use when user invokes /close, says "close the session", "wrap up", "end session", or asks for a session closeout.
---

# /close — session closeout

Three phases. Run them in order. Print a counter line at the end.

The memory dir is auto-pushed to `~/.claude-vault/` by the `memory-push.sh` Stop hook, so memory writes don't need a manual git push. Phase 2's git work is for the **outer project repo** (e.g. chezmoi, an app repo) — not the vault.

## Phase 1 — Retrospective

### 1. Scan context

Read back through the session and pull out only what's worth persisting:

- **Decisions** — choices made that shape future work (architectural, taxonomic, naming).
- **Insights / inefficiencies** — patterns spotted, surprises, things slower than expected.
- **Open tasks** — work named but not finished.
- **References** — external URLs, doc paths, dashboards, channels worth remembering.

Skip ephemeral debugging steps, retracted ideas, and anything already obvious from the diff.

### 2. Survey recent topics for context

Open Brain has no namespace concept and topics are **set by the server**, not the caller — `capture_thought` only takes `content`, and the server runs an LLM (GPT-4o-mini) over it to extract `type`, `topics` (1–3 tags), `people`, etc. So this step is observational, not decisional:

```
mcp__claude_ai_Open_Brain__list_thoughts({ days: 30, limit: 50 })
```

Note which topic tags are already in use. When phrasing the `content` in step 3, lean on existing topic vocabulary so the server-side extractor lands on the same tags — that's the only lever you have over topic clustering.

### 3. Capture thoughts to Open Brain

Call `mcp__claude_ai_Open_Brain__capture_thought({ content })` with a self-contained statement (will make sense to a future AI with no session context).

The server's LLM extracts `type` from one of `observation | task | idea | reference | person_note` based on what the content sounds like. You influence that extraction — and your own future keyword searches via `search_thoughts` — by leading the content with a consistent prefix word.

| Drew's term | Lead `content` with… | Server typically extracts `type` | Why the prefix |
|---|---|---|---|
| decision  | `Decision: …`  | observation | searchable by `Decision` later; decisions stay distinguishable from generic notes |
| insight   | `Insight: …`   | idea        | distinguishes "aha" findings from action items |
| task      | `TODO: …`      | task        | matches the standard convention the LLM and humans both recognise |
| reference | `Reference: …` | reference   | leading word + URL/path keeps refs findable by keyword |
| general   | (no prefix)    | observation | factual context with no need for a category prefix |

> **TODO (Drew):** confirm or edit the prefix words in column 2. These literal strings end up inside every captured thought, so they're what `search_thoughts` will hit on later. If you already use different conventions (e.g. `Note:` instead of `Decision:`), change them here. Leave a one-sentence rationale under this TODO once decided.

A captured thought always reads as a self-contained paragraph — the prefix is part of the sentence, not a tag header.

Example: `Decision: chose option (c) for /close commit splitting because logical-grouping needs LLM judgment, not a pre-baked rule. Topic: claude-code-skills, /close.`

### 4. Update memory files

Drew's memory follows the structure documented in his `~/.claude/CLAUDE.md` (YoungLeaders / Pawel Huryn scheme). Two destinations: global and project.

**Global memory** — `~/.claude/memory/`

| Content | Destination |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |

When you create a new file under `tools/` or `domain/`, add a one-line entry to `~/.claude/memory/memory.md` (the global index). Format: a row in the index table with file path, description, last-updated date.

**Project memory** — `~/.claude/projects/{mapped-cwd}/memory/MEMORY.md`

A **single file** (uppercase). Append project-specific learnings — active tickets, repo-specific patterns, decisions tied to this codebase — under the appropriate section already in `MEMORY.md`. Don't create sibling files.

Mapped path: cwd with `/` → `-`, prefixed with `-`. Example: `/Users/drew/.local/share/chezmoi` → `-Users-drew--local-share-chezmoi`.

**Do not** write new `feedback_*.md`, `user_*.md`, `project_*.md`, or `reference_*.md` files. Those are an older auto-memory pattern that predates Drew's structured system; existing ones in the dir are legacy and should be migrated by `reorganize-memory`, not extended by `/close`.

Entry shape (per the global rules): `date — what — why`. Nothing more.

## Phase 2 — Housekeeping

### 1. Locate the project repo

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If not inside a git repo, skip to step 4 (SESSION_LOG fallback to `~/SESSION_LOG.md`).

### 2. Inspect changes

```bash
git status --short
git diff --stat HEAD
git diff HEAD
```

Read the full diff. Don't just look at filenames — read hunks.

### 3. Split the diff into logical commits

Group hunks by **purpose**, not by file. A single file can span two commits; two files can belong to the same commit.

For each proposed group:

1. State the group: which paths/hunks, and the commit message (English imperative, conventional-commit prefix when it fits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
2. Ask Drew to confirm before staging.
3. On confirm: stage only the relevant paths. If hunks within a file split across commits, use `git add -p` and select.
4. Commit.

Do **not** push. Do **not** use `git add -A`.

If the diff is genuinely one logical change, propose a single commit — don't manufacture splits.

### 4. SESSION_LOG.md (cross-device)

Prepend to `~/.claude/memory/SESSION_LOG.md`. This file lives in the vault (auto-pushed by `memory-push.sh`), so entries sync to all of Drew's machines.

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
{ printf "%s\n\n" "$ENTRY"; cat "$LOG" 2>/dev/null; } > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
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
<N> thoughts → open-brain · <N> memory updates · <N> commits · SESSION_LOG updated
```

If a step was skipped (e.g. no git repo), drop that segment from the line rather than printing `0`.

## Self-check before reporting done

- Every `capture_thought` used a mapped Open Brain type (not Drew's raw term).
- Every new memory file has an entry in `MEMORY.md`.
- No `git push`. No staging with `-A`.
- SESSION_LOG entry is at the **top** of the file (newest first).
- Counter line reflects actual counts, not aspirational ones.
