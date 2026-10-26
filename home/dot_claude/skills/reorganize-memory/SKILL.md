---
name: reorganize-memory
description: Reorganize ~/.claude/memory/ and ~/.claude/rules/ (vault) — migrate legacy prefix-files, dedupe/merge/split, keep eager files lean. Use when user says "reorganize memory", "tidy memory", "clean up memory".
---

# Reorganize Memory

Always use plan mode — show the user what you intend to change before changing anything.

## Target structure

**Global memory** — `~/.claude/memory/` (vault-managed; knowledge Claude accumulates)

- An Open Knowledge Format v0.2 bundle: every file opens with `type`, `title` and `description` frontmatter (`type` is `Tool` in `tools/`, `Domain` in `domain/`). `python3 -I .githooks/memory-bundle.py`, run in the vault repo, writes the `index.md` in the root, `tools/` and `domain/` from that frontmatter; never hand-edit those three. Agents find a topic with `rg -il <term> ~/.claude/memory`, and `index.md` lists every file's description.
- `general.md` — cross-project conventions and quality gates. Stay lean — always-on behavioral rules go in `~/.agents/AGENTS.md`, path-scoped ones in `~/.claude/rules/`, not here.
- `tools/{tool}.md` — one file per tool. Lazy-loaded.
- `domain/{topic}.md` — domain knowledge per product/area (create lazily). Lazy-loaded.
- `SESSION_LOG.md` — closeout history; no longer written (`/close` ends on a status line the `open-loops` mod saves instead)
- `projects.md` — where per-project agent knowledge lives

**Behavioral rules** — native Claude Code mechanism; instructions, not facts (code.claude.com/docs/en/memory#organize-rules-with-claude/rules/). Two scopes:

- **User** — personal, all projects: always-on rules are one line each in `~/.agents/AGENTS.md` (imported by `~/.claude/CLAUDE.md`); path-scoped rules are `~/.claude/rules/{topic}.md`. This skill maintains both.
- **Project** `.claude/rules/{topic}.md` — team-shared, lives in the repo (tracked). Managed in-repo, NOT by this skill. User rules load before project rules, so project rules win on conflict.
- One rule per file. Rules with `paths:` frontmatter load only when Claude reads matching files; a user rule that would need no `paths:` belongs in `~/.agents/AGENTS.md` instead (pay-per-session context).
- `.claude/rules/` supports symlinks for sharing one rule across projects.

**Legacy patterns (do NOT create new):**
- Prefix-based filenames at the root of `~/.claude/memory/` — `feedback_X.md`, `user_X.md`, `project_X.md`, `reference_X.md`. Out of step with the structured system (general.md / tools/ / domain/ / rules/).
- Files under `~/.claude/memory/feedback/` — superseded by `~/.agents/AGENTS.md` and `~/.claude/rules/`. Migrate each to an AGENTS.md line or a path-scoped rule.

## Workflow

1. **Plan mode entry** — call EnterPlanMode (or note in conversation that we're operating cautiously). All destructive operations require explicit confirmation.

2. **Read all files in scope**: every top-level `.md` in `~/.claude/memory/`; `tools/` and `domain/` (if present); `feedback/` (legacy — should be empty or gone); `~/.agents/AGENTS.md`; `~/.claude/rules/**/*.md`; `projects.md`.

3. **Build a proposal** — for each candidate change, identify:
   - **Legacy-pattern files** — propose migration by content: behavioral rule → a line in `~/.agents/AGENTS.md`, or `~/.claude/rules/{topic}.md` when it applies to certain paths; convention/quality gate → `general.md`; tool knowledge → `tools/{tool}.md`; domain knowledge → `domain/{topic}.md`.
   - **`general.md` bloat** — content that is behavioral guidance rather than a flat convention/quality gate → extract to `~/.agents/AGENTS.md` or a path-scoped rule.
   - **Stale audits/inventories** — date-stamped snapshots, `⚠ Last seen` markers older than ~30 days, tool/package inventories. Per the Note-keeping bias in `working-patterns.md`, the content rots but the rationale survives: extract durable patterns/decisions FIRST, then propose the drop. Never a bare DROP without listing what durable content would be lost.
   - **Duplicates** — same meaning in multiple files. Recommend merge to one source.
   - **Merge candidates** — separate files, same topic. **Split candidates** — one file, multiple topics.
   - **Re-sort** — entries within a file ordered by content date (latest last) where dates exist.
   - **Missing frontmatter** — a file without `type`, `title` or `description`; `python3 -I .githooks/memory-bundle.py --check` in the vault repo lists them. Flag a missing `type` first: without it the bundle does not conform.

4. **Present the proposal** as a single ordered list with current → proposed per change. Use AskUserQuestion (multiSelect) so the user can approve a subset.

5. **Apply approved changes**: rule writes are governance surfaces, unlocked for 2h when the user typed `/reorganize-memory` (step 4's approval is the review gate) and use the vault branch → ff-merge flow. Memory writes need no unlock. Write/Edit for content; Bash for `mv`/`rm`; confirm any delete not already approved.

6. **Update indexes**: run `python3 -I .githooks/memory-bundle.py` in the vault repo; refresh `projects.md` if it changed; if `~/.claude/CLAUDE.md` enumerates topic files, update it (and the chezmoi source `home/dot_claude/CLAUDE.md.tmpl` if it differs) — show folders, don't enumerate files.

7. **Summary** — concise list of what changed, plus a `cvault status` reminder so Drew can push the vault.

## Constraints

- Never delete or modify an existing entry without explicit user confirmation, even if the user previously asked for the file.
- Preserve entry frontmatter (`type`, `title`, `description`) when merging or splitting; a new file gets all three.
- Never re-sort by mtime — only by content dates (frontmatter or in-body `**Last seen YYYY-MM-DD**` markers). No date → alphabetical.
- Don't propose changes to WIP/scratch areas (e.g. files explicitly marked draft).
