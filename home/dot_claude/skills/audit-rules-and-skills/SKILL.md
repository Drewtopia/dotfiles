---
name: audit-rules-and-skills
description: Audit ~/.claude/rules/ and ~/.claude/skills/ against the style guide — flag bloat, propose changes via AskUserQuestion, apply approved fixes
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
- For each: count lines, check frontmatter discipline, scan structure, scan for anti-patterns.

### 3. Classify findings

Classify each target:
- **Compliant** — within budget, clean frontmatter, no anti-patterns. Skip.
- **Trim candidate** — over budget but content is right; needs tightening.
- **Restructure candidate** — anti-patterns present (incident anecdotes in style rules, glossaries inline, narrative paragraphs where steps would work).
- **Split candidate** — multiple unrelated rules in one file.
- **Reference-extract candidate** — long skill with content that should move to a `REFERENCE.md` sibling.

### 4. Present and decide

For each non-compliant target:
1. Show current state (line count, identified issues).
2. Show proposed change (or set of options).
3. AskUserQuestion: accept, modify, skip.

Group questions when sensible — don't fire separate AskUserQuestions for the same fix-pattern across multiple files.

### 5. Apply approved changes

- Rules in `~/.claude/rules/` are cvault-managed. Edit in place at the symlinked location.
- Skills in `~/.claude/skills/` are chezmoi-managed. Edit chezmoi source under `home/dot_claude/skills/`, then `chezmoi apply` targeted to the changed file.
- Don't auto-commit either repo. Present commit messages and let user approve.
- For long skills, prefer extract-to-`REFERENCE.md` over content deletion.

### 6. Verify

- Run `/memory` in a fresh session to confirm new shapes load correctly.
- Re-count lines; confirm targets within budget.

## Constraints

- Never delete a rule or skill without explicit confirmation.
- Preserve `paths:` frontmatter on path-scoped rules during rewrites.
- Don't create new files in legacy `~/.claude/memory/feedback/` (use `~/.claude/rules/`).
- Two-repo commits: cvault first (push directly with conventional commit), then chezmoi (let user commit).
