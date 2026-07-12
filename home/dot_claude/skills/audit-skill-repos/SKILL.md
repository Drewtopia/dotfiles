---
name: audit-skill-repos
description: Use when checking whether the upstream skill repos tracked in chezmoi's home/.chezmoidata/skills.yaml (mattpocock/skills, vercel-labs/skills, awesome-copilot, etc.) have gained, renamed, or removed skills that should be reconciled — e.g. "check matt pocock's repo for new skills", "did any tracked skill repos update", "audit skills.yaml against upstream".
---

# Audit Skill Repos

Diff every upstream skill repo listed in chezmoi's `skills.yaml` against what's tracked, surface new / renamed / removed skills, and — on approval — reconcile `skills.yaml`.

This skill is **chezmoi-managed** (source: `home/dot_claude/skills/audit-skill-repos/`). Edit the source, or edit the target and `chezmoi add` it — a target-only edit gets reverted on the next apply.

## Key file

`~/.local/share/chezmoi/home/.chezmoidata/skills.yaml` — the source of truth. Each entry: a GitHub `repo:` plus the `skills:` list to install. A `run_onchange` script reconciles on change; topgrade owns ongoing `npx skills update`.

## Workflow

1. **Read** `skills.yaml`. For each `repo:`, note the tracked `skills:` names and any header comment (counts, reconcile notes, hidden-dir caveats).

2. **List upstream skills per repo** — layout-agnostic. A skill = the parent dir of a `SKILL.md`:
   ```bash
   gh api "repos/<owner>/<repo>/git/trees/HEAD?recursive=1" \
     --jq '.tree[] | select(.path|endswith("SKILL.md")) | .path' \
     | sed -E 's#^skills/##; s#/SKILL.md$##' | sort
   ```
   The leaf name (after the last `/`) is the installable skill name; the prefix is its category dir (`engineering/`, `misc/`, `in-progress/`, …).

3. **Diff** upstream leaf-names vs tracked names. Classify:
   - **New** — upstream, not tracked.
   - **Removed / renamed** — tracked, not upstream. A rename shows as one removal + one addition (e.g. `decision-mapping`→`wayfinder`, `diagnose`→`diagnosing-bugs`). Read commit messages to confirm: `gh api "repos/<owner>/<repo>/commits?per_page=10" --jq '.[].commit.message'`.

4. **Triage new skills.** Fetch each candidate's description:
   ```bash
   gh api "repos/<owner>/<repo>/contents/skills/<dir>/SKILL.md" \
     --jq '.content' | base64 -d | awk '/^description:/{sub(/^description: */,"");print;exit}'
   ```
   Flag fit: repo-agnostic + generally useful = strong; course/JS/personal-specific = weak. Note which category dir it lives in (see Gotchas).

5. **Present** a table (New / Renamed / Removed) with fit notes, then **AskUserQuestion** (multiSelect) for which new skills to add. Recommend, don't auto-add.

6. **On approval, edit `skills.yaml`:**
   - Add chosen names under the matching category comment (`# engineering/`, `# in-progress/`, …).
   - For a confirmed rename: swap the name AND add the old name to `home/.chezmoiremove.tmpl` (see Gotchas) so the orphaned payload is swept.
   - Don't add running skill counts to comments — they're churn-bait and go stale on every edit.

7. **Verify install** (optional but preferred) — the reconciler runs `npx skills add <repo> -g -y --skill <names…>`:
   ```bash
   cd "$HOME" && npx -y skills add <owner>/<repo> -g -y --skill <name…>
   ```
   Confirm `~/.claude/skills/<name>/SKILL.md` exists after. See PromptScript gotcha.

## Gotchas (hard-won)

- **Hidden category dirs** (`misc/`, `in-progress/`, `personal/`, `deprecated/`) are excluded from `npx skills add <repo> -l` (the list flag) BUT install fine by name via `--skill`, which the reconciler uses. So they're trackable — just flag `in-progress/` as unstable (upstream renames/breaks them; wayfinder churned 8 commits in one day).
- **`personal/` and `deprecated/`** — don't propose these unless asked; they're not meant for redistribution.
- **PromptScript "failure" is cosmetic.** Command-style skills (`disable-model-invocation: true`) print `✗ … PromptScript does not support global skill installation` under a "Failed to install N" banner, yet the real install succeeds — `~/.agents/skills/<name>` payload + `~/.claude/skills/<name>` symlink both land. Verify on disk, don't trust the exit banner. Same quirk hits already-working skills (grilling, triage).
- **Removing a skill** needs two edits: drop from `skills.yaml` AND add `.claude/skills/<name>` + `.agents/skills/<name>` lines to `home/.chezmoiremove.tmpl` — chezmoi doesn't manage the `.agents` payload store, so otherwise the payload orphans on every machine.
- **Lock file orphans (third cleanup).** The skills CLI tracks installs in `$XDG_STATE_HOME/skills/.skill-lock.json` (`~/.local/state/skills/` here; falls back to `~/.agents/.skill-lock.json`). `.chezmoiremove` deletes dirs but never touches the lock, and `npx skills remove` only matches on-disk skills — it can't scrub orphaned entries. Result: `skills update -g` warns "appear to have been deleted upstream" forever (topgrade's `-y` just skips the prompt each run). Fix: back up the lock, then pop the stale names from its `skills` object with python/jq. (2026-07-10: diagnose, to-issues, to-prd, zoom-out, write-a-skill.)
- **Don't commit unless asked.** Editing `skills.yaml` stages a change; leave the git commit to the user.

## Quick reference

| Need | Command |
|---|---|
| List a repo's skills | `gh api "repos/O/R/git/trees/HEAD?recursive=1" --jq '.tree[]\|select(.path\|endswith("SKILL.md")).path'` |
| One skill's description | `gh api "repos/O/R/contents/skills/DIR/SKILL.md" --jq .content \| base64 -d` |
| Recent commits (rename detection) | `gh api "repos/O/R/commits?per_page=10" --jq '.[].commit.message'` |
| Install by name | `cd ~ && npx -y skills add O/R -g -y --skill NAME…` |
