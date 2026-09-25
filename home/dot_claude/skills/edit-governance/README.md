# edit-governance

**Reference** — describes the mechanism as it is.

The sanctioned path for editing governance surfaces, in two parts that ship together:

## The skill (`SKILL.md`)

Explicit invocation only (`/edit-governance`; `disable-model-invocation: true`). Three phases:

1. **Scope** — every target file named with a one-line reason; each classified to its correct edit location (chezmoi source / vault / repo working tree); protected-`main` repos get a work branch. Then the unlock is granted.
2. **Edit** — smallest diff satisfying the scope; skills checked against the agentskills spec; rules kept lean; no attribution strings in tracked repos.
3. **Review** — mandatory and adversarial: full diff re-read, refutation pass (rule conflicts, weakened prohibitions, taxonomy violations, lost facts), findings presented, and **explicit user approval before any commit**.

## The guard (`~/.claude/hooks/edit-governance-guard.cjs`)

PreToolUse hook on `Edit|Write`, wired in `home/.chezmoitemplates/claude-settings-merge`. Denies edits whose `file_path` matches a governance pattern (CI/workflow files, `SKILL.md`, `.claude/`+`dot_claude/` rules/hooks/skills/settings, the settings merge template, the unlock markers, the vault, `CLAUDE.md`/`AGENTS.md`, `docs/adr/`, `CONTEXT*.md`) unless the calling session is unlocked. Denies on internal errors.

The Bash check `bash-checks/gate-governance-writes.js` applies the same patterns and the same unlock to redirects, `tee`, `cp`, `mv`, `rm`, `touch`, and in-place `sed`/`perl`, including inside `sh -c`/`eval`/`xargs`. It is a tripwire, not a boundary: interpreter writes (`python -c`, `node -e`, `awk`, `git apply`, `patch`) pass unseen.

**Unlock:** the `UserPromptExpansion` hook (`edit-governance-guard.cjs --expansion`) writes `~/.claude/governance-unlock/session-<session_id>` when the user types `/edit-governance`, `/audit-rules-and-skills`, or `/reorganize-memory`. The marker unlocks that session only and expires after 2 hours. No agent command grants it.

## Files

- `SKILL.md` — the skill (this directory)
- `home/dot_claude/hooks/edit-governance-guard.cjs` — guard source (chezmoi); live copy at `~/.claude/hooks/`
- `home/dot_claude/hooks/bash-checks/gate-governance-writes.js` — Bash write check, run by `pre-bash-dispatcher.js`
- Settings wiring: `hooks.PreToolUse` and `hooks.UserPromptExpansion` entries in `home/.chezmoitemplates/claude-settings-merge`
