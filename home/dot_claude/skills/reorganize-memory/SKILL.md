---
name: reorganize-memory
description: Reorganize ~/.claude/memory/ and project MEMORY.md files — migrate legacy-pattern files into the YoungLeaders folder structure, dedupe entries, merge related files, split overgrown files, re-sort by date, update memory.md index. Use when user says "reorganize memory", "tidy memory", "clean up memory", or wants to consolidate accumulated memory content.
---

# Reorganize Memory

Run this skill when memory needs maintenance. Always use plan mode — show the user what you intend to change before changing anything.

## Target structure

Documented in `~/.claude/CLAUDE.md`. This skill enforces it.

**Global memory** — `~/.claude/memory/` (knowledge Claude accumulates)

- `memory.md` — index, `@`-imported by CLAUDE.md so it loads at session start
- `general.md` — cross-project conventions and quality gates. **Stay lean** — not a dumping ground for everything; behavioral rules go in `~/.claude/rules/`.
- `tools/{tool}.md` — one file per tool (bun, chezmoi, mise, television, etc.). Lazy-loaded.
- `domain/{topic}.md` — domain knowledge per product/area. Lazy-loaded.
- `SESSION_LOG.md` — cross-device session log (auto-appended by `/close`)
- `projects.md` — index of active project MEMORY.md paths
- `personal.md` — notes about people

**Behavioral rules** — `~/.claude/rules/` (instructions Drew writes; native Claude Code mechanism)

- `{topic}.md` — one rule per file. Loaded structurally by Claude Code at session start.
- Rules with `paths:` frontmatter only load when Claude reads matching files. Use for style/convention rules tied to specific file types (e.g. CLAUDE.md, MEMORY.md).
- Rules without `paths:` load every session — reserve for safety rules and universal style.

**Project memory** — `~/.claude/projects/{mapped-cwd}/memory/MEMORY.md`

A **single file with sections** is Drew's preference — not a directory of sibling files. Note: native auto-memory (v2.1.59+) may write topic files alongside `MEMORY.md`; preserve any autonomous content rather than collapsing it. The 200-line / 25KB session-start budget applies to `MEMORY.md` itself.

**Legacy patterns (do NOT create new):**
- Prefix-based filenames at the root of a memory directory — `feedback_X.md`, `user_X.md`, `project_X.md`, `reference_X.md`. These come from Claude Code's auto-memory default and are out of step with Drew's structured system.
- Files under `~/.claude/memory/feedback/` — superseded by `~/.claude/rules/` (native rules mechanism). Migrate to rules/ and strip `type: feedback` frontmatter.

## Workflow

1. **Plan mode entry** — call EnterPlanMode (or note in conversation that we're operating cautiously). All destructive operations require explicit confirmation per the global memory rules.

2. **Read all memory and rules files in scope**:
   - `~/.claude/memory/memory.md` and every file in the index
   - `~/.claude/memory/{tools,domain}/**/*.md`
   - `~/.claude/memory/feedback/**/*.md` (if exists — should be empty / removed; legacy location)
   - `~/.claude/rules/**/*.md`
   - `~/.claude/memory/projects.md` (if exists)
   - For each path in `projects.md`: that project's `memory/MEMORY.md` + any sibling files in the same directory (auto-memory may have written topic files there)
   - `~/.claude/memory.bak.*/` directories — pre-existing memory content auto-backed-up by chezmoi when the vault symlink landed on a fresh machine. Treat as merge candidates.

3. **Build a proposal** — for each candidate change, identify:
   - **Legacy-pattern files** — any prefix-based-flat-at-root file (`feedback_*.md`, `user_*.md`, `project_*.md`, `reference_*.md`) sitting at the root of `~/.claude/memory/` or in any `~/.claude/projects/*/memory/`. Propose migration based on content:
     - Behavioral rule / correction → new `~/.claude/rules/{topic}.md`
     - Cross-project convention / quality gate → merge into `general.md`
     - Tool-specific knowledge → `~/.claude/memory/tools/{tool}.md` (new file or append)
     - Domain/product knowledge → `~/.claude/memory/domain/{topic}.md`
     - Project-specific workflow/state → fold into that project's `MEMORY.md` under a section, then delete the sibling
   - **Files in legacy `~/.claude/memory/feedback/`** — migrate each to `~/.claude/rules/{topic}.md`. Strip `type: feedback` frontmatter (native rules don't use it). For file-type-specific rules, add `paths:` frontmatter so they only load when Claude reads matching files.
   - **`general.md` bloat** — if `general.md` has grown beyond ~50 lines or contains content that's clearly behavioral guidance rather than a flat convention/quality gate, propose extracting to `~/.claude/rules/{topic}.md` files.
   - **Project memory as a directory of files** — if a project's memory dir has multiple `*.md` files alongside `MEMORY.md`, propose collapsing them into MEMORY.md sections. Sibling files don't load at session start; only `MEMORY.md` does.
   - **Stale audits/inventories** — date-stamped audit lists, `⚠ Last seen` markers older than ~30 days, snapshots of tool installs or package lists. Per the Note-keeping bias section in `~/.claude/memory/working-patterns.md`, the **content rots but the rationale survives**. For each candidate drop:
     1. Identify durable patterns / decisions / rationale (the "why" and "how" — not the "what" of static inventories).
     2. Extract those into the appropriate global file (`~/.claude/memory/tools/{tool}.md`, `~/.claude/memory/domain/{topic}.md`, or `~/.claude/rules/{topic}.md`) BEFORE proposing the drop.
     3. Only propose drop AFTER the extraction is in the migration plan.
     Never propose a bare DROP without first listing what durable content would be lost. Files under `~/.claude/projects/*/memory/` were auto-generated by Claude across past sessions — they're a record of captured insights, not just transient state. Treat extraction as the default, drop as the exception.
   - **Duplicates** — entries appearing in multiple files. Recommend merge.
   - **Merge candidates** — separate files covering the same topic. Recommend single file.
   - **Split candidates** — files too large or covering multiple topics. Recommend split.
   - **Re-sort** — entries within each file should be ordered by date (latest last) where dates exist.
   - **Index drift** — `memory.md` table doesn't reflect current files.
   - **Migration candidates from `.bak.*`** — for each `~/.claude/memory.bak.<timestamp>/` directory:
     - Diff against `~/.claude/memory/`.
     - For files unique to `.bak`: propose copying into the canonical structure (`general.md` / `~/.claude/memory/tools/` / `~/.claude/memory/domain/` / `~/.claude/rules/`), not as legacy-pattern files.
     - For files in both: propose merge if different, skip if identical.
     - After successful merge confirmation: offer to delete the `.bak` dir.
     - Never silently auto-delete a `.bak` dir; require explicit user approval.

4. **Present the proposal** as a single ordered list with current → proposed for each change. Use AskUserQuestion (multiSelect) to let the user approve a subset.

5. **Apply approved changes**:
   - Use Write/Edit for content modifications.
   - Use Bash for `mv` / `rm`.
   - For deletes/renames of entries with content: confirm before each via AskUserQuestion if not already approved.

6. **Update indexes**:
   - `memory.md` table refreshes with current files and Last updated dates.
   - `projects.md` table refreshes if project memories changed.
   - If `~/.claude/CLAUDE.md` lists topic files, update that list too (and the chezmoi source `home/dot_claude/CLAUDE.md.tmpl` if it differs). Keep that list **lean** — show folders rather than enumerating every file.

7. **Summary** — concise list of what changed, plus a `cvault status` reminder so Drew can push the vault.

## Constraints

- Never delete or modify an existing entry without explicit user confirmation, even if the user previously asked for the file.
- Preserve entry frontmatter (`name`, `description`, `type`) when merging or splitting.
- Never re-sort by mtime — only by content dates (frontmatter or in-body `**Last seen YYYY-MM-DD**` markers). If no date exists, sort alphabetically.
- Don't propose changes to WIP/scratch areas (e.g. `domain/{topic}/draft.md` explicitly marked draft).
- **Never create new files in the legacy patterns.** Legacy patterns are: (a) prefix-based filenames at the root of a memory directory (`feedback_X.md`, `user_X.md`, `project_X.md`, `reference_X.md`); (b) files under `~/.claude/memory/feedback/` (superseded by `~/.claude/rules/`). New content placement:
  - `~/.claude/memory/general.md` — conventions and quality gates (lean, ~50 lines)
  - `~/.claude/memory/tools/{tool}.md` — tool knowledge (lazy-loaded)
  - `~/.claude/memory/domain/{topic}.md` — product/area knowledge (lazy-loaded)
  - `~/.claude/rules/{topic}.md` — behavioral rules. Strip `type:` frontmatter; add `paths:` for file-type-specific rules.
  - Project content → that project's `MEMORY.md` as a section.
- Project memory is conceptually one file (`MEMORY.md`), but native auto-memory (v2.1.59+) may write topic files alongside it. **Preserve any autonomous writes** — never delete sibling files without first reading them and confirming with the user. Only fold/delete siblings that are clearly handcrafted-and-stale, not auto-memory output.
- Keep `general.md` lean (~50 lines target). It loads at session start every time — pay-per-byte. Behavioral rules belong in `~/.claude/rules/{topic}.md`. Rules load eagerly by default; for file-type-specific rules, use `paths:` frontmatter so they only load when relevant.
