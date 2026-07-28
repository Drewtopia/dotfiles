---
name: audit-rules-and-skills
description: Use when auditing ~/.claude/rules/ or ~/.claude/skills/ for bloat, stale content, or frontmatter drift — proposes trims against the style guide and applies approved fixes.
---

# Audit rules and skills

The full style guide lives in `REFERENCE.md` (sibling file). Read it before starting.

## Process

### 1. Pick scope

AskUserQuestion with these four options **exactly**. Do NOT substitute pre-filtered recommendations or "top N bloated" shortcuts — that erodes user agency.

- All rules in `~/.claude/rules/`
- All skills in `~/.claude/skills/`
- Both
- A specific subset (user names files in a follow-up)

You may show line-count data or bloat indicators alongside the question to inform the choice. Never replace the canonical options.

### 2. Read targets and the reference

- Read `REFERENCE.md` from this skill's directory.
- Read each target file in scope.
- **Classify resident vs lazy first** (see REFERENCE.md). A rule with no `paths:` and every skill's `description` are resident; skill bodies and path-scoped rules are not. This ranks every later finding — don't measure before you've classified.
- Then per file: count lines, check frontmatter discipline, scan structure, scan for anti-patterns.

### 3. Classify findings

Classify each target:
- **Compliant** — within budget, clean frontmatter, no anti-patterns. Skip.
- **Trim candidate** — over budget but content is right; needs tightening.
- **Restructure candidate** — anti-patterns present (incident anecdotes in style rules, glossaries inline, narrative paragraphs where steps would work).
- **Split candidate** — multiple unrelated rules in one file.
- **Reference-extract candidate** — long skill with content that should move to a `REFERENCE.md` sibling.

### 4. Present and decide

Report all findings in one pass before asking anything. Per non-compliant target: current state (class, line count, issues), then the proposed change.

Then gate with **one** AskUserQuestion — "apply all (recommended) / let me pick / keep everything". Only on "let me pick", follow up with a single multiSelect, one option per fix-pattern (not per file). Reserve per-target questions for the case where a single target has genuinely competing rewrites worth choosing between.

Ordering within the report: resident findings first, lazy ones after. Say which class each is in — a user declining a lazy trim should know it costs no context.

### 5. Apply approved changes

- Rules in `~/.claude/rules/` are cvault-managed. Edit in place at the symlinked location.
- Skills in `~/.claude/skills/` are chezmoi-managed. Edit chezmoi source under `home/dot_claude/skills/`, then `chezmoi apply` targeted to the changed file.
- Don't auto-commit either repo. Present commit messages and let user approve.
- For long skills, prefer extract-to-`REFERENCE.md` over content deletion.

### 6. Verify

- Re-count lines; confirm targets are within budget for their class.
- Confirm rewritten frontmatter still parses — a broken `---` block makes a rule or skill load as nothing.
- Tell the user to run `/context` in their next session and check **Memory files**: that lists what actually loaded, which is the only real confirmation that a newly-added `paths:` moved a rule off the resident set. `/memory` lists file locations, not what loaded — don't use it for this.
- For a rule that should now be path-scoped, the `InstructionsLoaded` hook logs which instruction files load and why.

## Constraints

- Never delete a rule or skill without explicit confirmation.
- Preserve `paths:` frontmatter on path-scoped rules during rewrites. Dropping it silently promotes the rule to always-loaded.
- Verify any file, skill, or plugin this skill names still exists before citing it. Exemplars and paths rot.
- Two-repo commits: cvault first (push directly with conventional commit), then chezmoi (let user commit).
