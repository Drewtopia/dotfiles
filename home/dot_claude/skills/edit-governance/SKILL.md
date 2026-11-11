---
name: edit-governance
description: The only sanctioned path for editing governance surfaces — workflow/CI files, architecture docs (ADRs, CONTEXT), skills, rules, hooks, and agent config. Scopes the change, makes the smallest edit in the correct source location, then runs a mandatory adversarial review before anything is committed.
disable-model-invocation: true
---

# Edit governance surfaces

An edit to a governance surface prompts for approval: the `permissions.ask` rules in `settings.json` cover rule files, skills, hooks and agent settings. This skill is the procedure for such an edit. Take the review phase seriously — it is the point of the skill, not a formality.

## Phase 1 — Scope (before any edit)

1. Name every file to be changed and the reason, in one line each. No file may be added later without restating scope.
2. Classify each target's **correct edit location**:
   - Chezmoi-managed (any skill with a source under `home/dot_claude/skills/`, hooks, CLAUDE.md — check with `chezmoi source-path <live-path>`): edit **chezmoi source** (`~/.local/share/chezmoi/home/dot_claude/...`), then `chezmoi apply <live-path>`.
   - Vault (`~/.claude-vault/rules|memory|projects`, symlinked from `~/.claude/rules`, `~/.claude/memory` and a repo's `CLAUDE.local.md`): edit vault paths.
   - Repo-local (`.claude/rules`, `.claude/skills`, `docs/adr/`, CI files): edit in the repo working tree.
   - A **new** user-level skill starts in the vault (`~/.claude-vault/skills/<name>`, symlinked into `~/.claude/skills`). It moves to chezmoi, which is a public repo, only when the user asks, and only once it holds nothing machine- or employer-specific.
3. Both the vault and the chezmoi repo protect `main` — create a work branch in its own worktree first (`wt -C <repo> switch --create <type>/<slug> --no-cd`) and edit and commit there. Never bypass those hooks. How the branch lands differs:
   - Vault: `wt -C <worktree> step push`, which fast-forwards `main` to the branch and refuses a non-fast-forward (not `wt merge`: it squashes). Then print `! git -C ~/.claude-vault push origin main` for Drew to run (the push guard blocks agents from pushing `main`), then `wt -C ~/.claude-vault remove <type>/<slug>`.
     - When it stops on uncommitted changes in the main checkout, leave them (they may be another session's): print `! git -C ~/.claude-vault push origin <type>/<slug>:main` instead, which lands on GitHub without touching the checkout.
   - Chezmoi: push the branch and open a PR (`gh pr create`); `main` changes only by its merge. After it merges, `chezmoi update` and `wt -C <repo> remove <type>/<slug>`.
4. Each Edit or Write to a governed file prompts the user; a session with no prompt denies it. The prompt covers the file tools only, so never change a governance surface with a shell write (`>`, `tee`, `cp`, `mv`, `sed -i`) or an interpreter (`python -c`, `node -e`).

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
    - Does a doc change state what is, leaving history to git (`~/.agents/AGENTS.md`)?
    - Did any fact, command, or gotcha get lost relative to the old version? Diff-check, don't assume.
11. Present to the user: the full diff, the refutation findings (including "none found"), and the commit plan. **Wait for explicit approval.** Do not commit, merge, or push before it.
12. After approval: commit on the work branch, then land it per step 3 (vault: `wt step push`, then Drew pushes; chezmoi: branch push and PR). Confirm clean status in every touched repo.

## Gotchas

- `chezmoi apply` prompts on drifted files and dies without a TTY: apply per-file, and investigate any "has changed since chezmoi last wrote it" before `--force`.
- Editing this skill or the `ask` rules is itself a governed edit — this skill applies to its own maintenance.
