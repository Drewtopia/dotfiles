---
name: edit-governance
description: The only sanctioned path for editing governance surfaces — workflow/CI files, architecture docs (ADRs, CONTEXT), skills, rules, hooks, and agent config. Scopes the change, makes the smallest edit in the correct source location, then runs a mandatory adversarial review before anything is committed.
disable-model-invocation: true
---

# Edit governance surfaces

Direct edits to governance surfaces are blocked by `~/.claude/hooks/edit-governance-guard.cjs` and forbidden by the `governed-edits-require-skill` rule. This skill is the sanctioned path. Take the review phase seriously — it is the point of the skill, not a formality.

## Phase 1 — Scope (before any unlock)

1. Name every file to be changed and the reason, in one line each. No file may be added later without restating scope.
2. Classify each target's **correct edit location**:
   - Chezmoi-managed (`~/.claude/skills/{audit-rules-and-skills,audit-skill-repos,clean-workspace,close,find-session,housekeeping,open-brain,reconcile-tracker,reorganize-memory,edit-governance}`, hooks, CLAUDE.md): edit **chezmoi source** (`~/.local/share/chezmoi/home/dot_claude/...`), then `chezmoi apply <live-path>`.
   - Vault (`~/.claude-vault/rules|memory`, symlinked from `~/.claude/rules` and `~/.claude/memory`): edit vault paths.
   - Repo-local (`.claude/rules`, `.claude/skills`, `docs/adr/`, CI files): edit in the repo working tree.
3. Both the vault and the chezmoi repo protect `main` — create a work branch first (`git -C <repo> switch -c <type>/<slug>`), commit there, then `merge --ff-only` back and push. Never bypass those hooks.
4. Grant the unlock: `node ~/.claude/hooks/edit-governance-guard.cjs --unlock` (2h, marker + convergence session-registry stamp). Gotcha: the unlock is machine-global, not per-session — do not leave governance edits half-done for another session to trip over.

## Phase 2 — Edit

5. Smallest diff that satisfies the scope. One concern per commit.
6. New/changed skills must satisfy the agentskills spec: `name` matches directory, lowercase-hyphen ≤64 chars; description ≤1024 chars, states what + when ("Use when…"); SKILL.md ≤500 lines; spec-clean frontmatter.
7. New/changed rules: one rule per file; eager rules stay lean; file-type-specific rules get `paths:` frontmatter.
8. Tracked repo content: no vendor/assistant attribution strings.

## Phase 3 — Review (mandatory, adversarial)

9. Re-read every diff in full (`git diff`, not memory).
10. Adversarial pass — actively try to refute each change:
    - Does it conflict with an existing rule, skill, or ADR? Grep for overlaps.
    - Does it weaken a prohibition or safety rule? (Never acceptable silently.)
    - Does a doc change violate `documentation-policy` (as-is, taxonomy, lifecycle, reference rules)?
    - Did any fact, command, or gotcha get lost relative to the old version? Diff-check, don't assume.
11. Present to the user: the full diff, the refutation findings (including "none found"), and the commit plan. **Wait for explicit approval.** Do not commit, merge, or push before it.
12. After approval: commit on the work branch, `merge --ff-only` to main, push (vault) / `chezmoi apply` + push (chezmoi). Confirm clean status in every touched repo.

## Gotchas

- The guard fails open on internal errors — a silent non-block is not permission; the rule still applies.
- `chezmoi apply` prompts on drifted files and dies without a TTY: apply per-file, and investigate any "has changed since chezmoi last wrote it" before `--force`.
- Editing this skill or the guard hook is itself a governed edit — this skill applies to its own maintenance.
