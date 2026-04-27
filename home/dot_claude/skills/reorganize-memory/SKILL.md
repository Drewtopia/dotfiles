---
name: reorganize-memory
description: Reorganize ~/.claude/memory/ and project MEMORY.md files — dedupe entries, merge related files, split overgrown files, re-sort by date, update memory.md index. Use when user says "reorganize memory", "tidy memory", "clean up memory", or wants to consolidate accumulated memory content.
---

# Reorganize Memory

Run this skill when memory needs maintenance. Always use plan mode — show the user what you intend to change before changing anything.

## Workflow

1. **Plan mode entry** — call EnterPlanMode (or note in conversation that we're operating cautiously). All destructive operations require explicit confirmation per the global memory rules.

2. **Read all memory files in scope**:
   - `~/.claude/memory/memory.md` and all topic files referenced
   - `~/.claude/memory/{tools,domain}/**/*.md`
   - `~/.claude/memory/projects.md` (if exists)
   - For each path in projects.md: that project's `memory/MEMORY.md` + entry files

3. **Build a proposal** — for each candidate change, identify:
   - **Duplicates**: entries that appear in multiple files. Recommend merge.
   - **Outdated entries**: dated content that's likely stale (per the user's "notes go stale" rule). Recommend flag (don't auto-delete).
   - **Merge candidates**: separate files covering the same topic. Recommend single file.
   - **Split candidates**: files too large or covering multiple topics. Recommend split.
   - **Re-sort**: entries within each file should be ordered by date (latest last) where dates exist.
   - **Type mismatches**: filename prefix vs frontmatter `type:` mismatch (e.g. file named `project_*.md` but frontmatter says `type: feedback`).
   - **Index drift**: `memory.md` table doesn't reflect current files.

4. **Present the proposal** as a single ordered list with current → proposed for each change. Use AskUserQuestion (multiSelect) to let the user approve a subset.

5. **Apply approved changes**:
   - Use Write/Edit for content modifications.
   - Use Bash for `mv` / `rm`.
   - For deletes/renames of entries with content: confirm before each via AskUserQuestion if not already approved.

6. **Update indexes**:
   - `memory.md` table refreshes with current files and Last updated dates.
   - `projects.md` table refreshes if project memories changed.

7. **Summary** — concise list of what changed.

## Constraints

- Never delete or modify an existing entry without explicit user confirmation, even if you previously asked for the file.
- Preserve entry frontmatter (`name`, `description`, `type`) when merging or splitting.
- Never re-sort by mtime — only by content dates (frontmatter or in-body `**Last seen YYYY-MM-DD**` markers). If no date exists, sort alphabetically.
- Don't propose changes to the WIP/scratch areas (e.g. `domain/{topic}/draft.md` if explicitly marked draft).
