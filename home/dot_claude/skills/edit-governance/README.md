# edit-governance

**Reference** — describes the mechanism as it is.

The procedure for editing governance surfaces, and the prompt that backs it:

## The skill (`SKILL.md`)

Explicit invocation only (`/edit-governance`; `disable-model-invocation: true`). Three phases:

1. **Scope** — every target file named with a one-line reason; each classified to its correct edit location (chezmoi source / vault / repo working tree); protected-`main` repos get a work branch.
2. **Edit** — smallest diff satisfying the scope; skills checked against the agentskills spec; rules kept lean; no attribution strings in tracked repos.
3. **Review** — mandatory and adversarial: full diff re-read, refutation pass (rule conflicts, weakened prohibitions, taxonomy violations, lost facts), findings presented, and **explicit user approval before any commit**.

## The prompt (`permissions.ask`)

`Edit(...)` rules in `permissions.ask`, set in `home/.chezmoitemplates/claude-settings-merge`. An Edit or Write to a matching file prompts the user in every permission mode; a session with no prompt denies it. The rules cover `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, `SKILL.md`, `.claude/` settings and hooks, the `dot_claude/` source, the settings merge template, the dcg config, and the vault's rules, global, projects and hooks folders.

CI and workflow files, `docs/adr/` and `CONTEXT*.md` are not covered: their PR review is the check.

The rules cover the file tools only. A shell write (`>`, `tee`, `sed -i`) or an interpreter write is not prompted.

## Files

- `SKILL.md` — the skill (this directory)
- Settings: the `permissions.ask` entries in `home/.chezmoitemplates/claude-settings-merge`
