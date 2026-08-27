---
name: reorganize-memory
description: Reorganize ~/.claude/memory/ and ~/.claude/rules/ (vault) — migrate legacy prefix-files, dedupe/merge/split, keep eager files lean. Use when user says "reorganize memory", "tidy memory", "clean up memory".
---

# Reorganize Memory

Always use plan mode — show the user what you intend to change before changing anything.

## Target structure

**Global memory** — `~/.claude/memory/` (vault-managed; knowledge Claude accumulates)

- `memory.md` — index (file + description rows), `@`-imported by CLAUDE.md so it loads at session start
- `general.md` — cross-project conventions and quality gates. Stay lean — behavioral rules go in `~/.claude/rules/`, not here.
- `tools/{tool}.md` — one file per tool. Lazy-loaded.
- `domain/{topic}.md` — domain knowledge per product/area (create lazily). Lazy-loaded.
- `SESSION_LOG.md` — cross-device session log (prepended by `/close`)
- `projects.md` — where per-project agent knowledge lives

**Behavioral rules** — native Claude Code mechanism; instructions, not facts (code.claude.com/docs/en/memory#organize-rules-with-claude/rules/). Two scopes:

- **User** `~/.claude/rules/{topic}.md` — personal, all projects. This skill maintains these.
- **Project** `.claude/rules/{topic}.md` — team-shared, lives in the repo (tracked). Managed in-repo, NOT by this skill. User rules load before project rules, so project rules win on conflict.
- One rule per file. Rules with `paths:` frontmatter load only when Claude reads matching files; rules without `paths:` load every session — reserve for safety + universal style (pay-per-session context).
- `.claude/rules/` supports symlinks for sharing one rule across projects.

**Legacy patterns (do NOT create new):**
- Prefix-based filenames at the root of `~/.claude/memory/` — `feedback_X.md`, `user_X.md`, `project_X.md`, `reference_X.md`. Out of step with the structured system (general.md / tools/ / domain/ / rules/).
- Files under `~/.claude/memory/feedback/` — superseded by `~/.claude/rules/`. Migrate to rules/ and strip `type: feedback` frontmatter.

## Workflow

1. **Plan mode entry** — call EnterPlanMode (or note in conversation that we're operating cautiously). All destructive operations require explicit confirmation.

2. **Read all files in scope**: `memory.md` and every file in its index; `tools/` and `domain/` (if present); `feedback/` (legacy — should be empty or gone); `~/.claude/rules/**/*.md`; `projects.md`.

3. **Build a proposal** — for each candidate change, identify:
   - **Legacy-pattern files** — propose migration by content: behavioral rule → `~/.claude/rules/{topic}.md`; convention/quality gate → `general.md`; tool knowledge → `tools/{tool}.md`; domain knowledge → `domain/{topic}.md`.
   - **`general.md` bloat** — content that is behavioral guidance rather than a flat convention/quality gate → extract to `~/.claude/rules/{topic}.md`.
   - **Stale audits/inventories** — date-stamped snapshots, `⚠ Last seen` markers older than ~30 days, tool/package inventories. Per the Note-keeping bias in `working-patterns.md`, the content rots but the rationale survives: extract durable patterns/decisions FIRST, then propose the drop. Never a bare DROP without listing what durable content would be lost.
   - **Duplicates** — same meaning in multiple files. Recommend merge to one source.
   - **Merge candidates** — separate files, same topic. **Split candidates** — one file, multiple topics.
   - **Re-sort** — entries within a file ordered by content date (latest last) where dates exist.
   - **Index drift** — `memory.md` table doesn't reflect current files.

4. **Present the proposal** as a single ordered list with current → proposed per change. Use AskUserQuestion (multiSelect) so the user can approve a subset.

5. **Apply approved changes**: rule writes are governance surfaces — `node ~/.claude/hooks/edit-governance-guard.cjs --unlock` first (step 4's approval is the review gate) and use the vault branch → ff-merge flow. Memory writes need no unlock. Write/Edit for content; Bash for `mv`/`rm`; confirm any delete not already approved.

6. **Update indexes**: refresh the `memory.md` table (file + description); refresh `projects.md` if it changed; if `~/.claude/CLAUDE.md` enumerates topic files, update it (and the chezmoi source `home/dot_claude/CLAUDE.md.tmpl` if it differs) — show folders, don't enumerate files.

7. **Summary** — concise list of what changed, plus a `cvault status` reminder so Drew can push the vault.

## Constraints

- Never delete or modify an existing entry without explicit user confirmation, even if the user previously asked for the file.
- Preserve entry frontmatter (`name`, `description`, `type`) when merging or splitting.
- Never re-sort by mtime — only by content dates (frontmatter or in-body `**Last seen YYYY-MM-DD**` markers). No date → alphabetical.
- Don't propose changes to WIP/scratch areas (e.g. files explicitly marked draft).
