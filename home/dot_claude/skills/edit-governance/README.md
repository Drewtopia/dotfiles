# edit-governance

**Reference** — describes the mechanism as it is.

The sanctioned path for editing governance surfaces, in two parts that ship together:

## The skill (`SKILL.md`)

Explicit invocation only (`/edit-governance`; `disable-model-invocation: true`). Three phases:

1. **Scope** — every target file named with a one-line reason; each classified to its correct edit location (chezmoi source / vault / repo working tree); protected-`main` repos get a work branch. Then the unlock is granted.
2. **Edit** — smallest diff satisfying the scope; skills checked against the agentskills spec; rules kept lean; no attribution strings in tracked repos.
3. **Review** — mandatory and adversarial: full diff re-read, refutation pass (rule conflicts, weakened prohibitions, taxonomy violations, lost facts), findings presented, and **explicit user approval before any commit**.

## The guard (`~/.claude/hooks/edit-governance-guard.cjs`)

PreToolUse hook on `Edit|Write|MultiEdit`, wired in `~/.claude/settings.json`. Denies edits whose `file_path` matches a governance pattern (CI/workflow files, `SKILL.md`, `.claude/`+`dot_claude/` rules/hooks/skills/settings, the vault, `CLAUDE.md`/`AGENTS.md`, `docs/adr/`, `CONTEXT*.md`) unless an unlock is active. Fails open on internal errors — a silent non-block is not permission.

**Unlock:** `node ~/.claude/hooks/edit-governance-guard.cjs --unlock`

- Writes a marker (`~/.claude/governance-unlock/active`, 2-hour TTL).
- Best-effort stamps `governanceUnlockUntil` into every live session entry of the convergence session registry (`<git-common-dir>/sessions/*.json` — owned by `session-registry.cjs`; parsed tolerantly, additive field only).

**Known limit:** Bash sessions expose no session id, so the marker unlock is machine-global for its 2-hour window, not per-session. The registry stamp exists so registry-aware tooling can tighten this later.

## Files

- `SKILL.md` — the skill (this directory)
- `home/dot_claude/hooks/edit-governance-guard.cjs` — guard source (chezmoi); live copy at `~/.claude/hooks/`
- Settings wiring: `hooks.PreToolUse` entry in `~/.claude/settings.json` (runtime-added; a fresh machine needs it re-added or templated)
