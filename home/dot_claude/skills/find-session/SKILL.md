---
name: find-session
description: Search past Claude sessions by a fuzzy memory of what they were about; ranked results with resume commands. --removed recovers cleared Agent View cards.
disable-model-invocation: true
---

# Find session

No native content-search exists — `claude --resume` is a picker with no query — so this greps the
transcripts directly.

## Run

1. Turn the user's fuzzy memory into search terms — synonyms, likely file/API/function names, error
   strings. More specific terms rank better; start narrow, broaden if empty.
2. `uv run ~/.claude/skills/find-session/find-session.py <terms...>`
   Add `--all` to search every project; default scope is the **current project's** slugs (derived
   from cwd), **including its worktree slugs** (`*--claude-worktrees-*`).
   - **`--removed`** (no terms): list Agent View cards housekeeping removed, newest first, with
     resume commands. Reads `~/.claude/housekeeping/removed-log.jsonl` (housekeeping appends on each
     `claude rm`). Use when the user says "I cleared something and want it back" — `claude rm` keeps
     the transcript, so every entry is resumable unless `cleanupPeriodDays` has since expired it
     (flagged inline).
3. The script rg's transcripts, ranks by hit count + recency, prints date · title · branch · snippet
   · `claude --resume <id>`.
4. Present the top hits. If none fit, expand or swap terms and re-run. Offer to resume the pick.

## Notes

- **Worktree sessions live under their own project slug** (`…--claude-worktrees-<name>`), so a
  session about a ticket often is NOT in the main slug. Default scope already spans them.
- Search covers both the user's prompts and the assistant's replies.
- Keyword/regex only — no embeddings. If recall keeps missing, broaden terms rather than reach for
  semantic search.
- The transcript JSONL format is internal and changes between Claude Code releases (docs say scripts
  parsing it "can break on any release") — if results go empty or fields vanish after an upgrade,
  suspect the format before the search terms.
