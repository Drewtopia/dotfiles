# Style guide for rules and skills

Reference for the `audit-rules-and-skills` skill. Distilled from:

- [Anthropic: Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (canonical)
- [Anthropic Claude Code docs: Memory](https://code.claude.com/docs/en/memory)
- Jose Parreño Garcia's substack ("How Claude Code rules actually work")
- karanb192/awesome-claude-skills, HumanLayer's "Writing a good CLAUDE.md"
- Audit of well-shaped skills already on disk (`superpowers:executing-plans`, `commit-messages`)

## Concision principle

Anthropic's first rule: *"Default assumption: Claude is already very smart. Only add context Claude doesn't already have."* Challenge each piece of content with three questions:

1. Does Claude really need this explanation?
2. Can I assume Claude knows this?
3. Does this paragraph justify its token cost?

If the answer to #1 is no, or #2 is yes, or #3 is no — cut it.

## Length budgets

| Type | Target lines | Hard cap |
|---|---|---|
| Rule (`~/.claude/rules/*.md`) | 9–25 | 40 |
| Terse skill | 50–80 | 100 |
| Moderate skill | 100–150 | 200 |
| Long skill (rare) | 150–250 | 500 |
| `CLAUDE.md` | ≤120 | 200 |

500 lines is Anthropic's official SKILL.md ceiling — anything beyond should split into reference files. Our targets are tighter as a quality bar. A rule over 25 lines or a skill over 200 is a candidate for split, trim, or move-to-reference-file.

## Frontmatter

- `description:` — **always third person** ("Processes Excel files…" not "I can help…" or "You can…"). Single sentence, 8–15 words preferred (1024 char hard cap per Anthropic). Include both *what* the rule/skill does and *when* to use it. Front-load the use case.
- `name:` — gerund form preferred (`processing-pdfs`, `analyzing-spreadsheets`). Noun-phrase or imperative acceptable (`commit-messages`, `audit-rules-and-skills`). Lowercase, hyphens only, no reserved words ("anthropic", "claude").
- `paths:` — only on rules that are file-type specific. Glob arrays.
- Optional: `when_to_use:` for skills with richer triggering. <50 words.
- Skip `author`, `tags`, `category`, `version`. They're conventions from other systems and add cognitive load.

## Structure

- **H2 only when there are 3+ sections.** 1–2 sections = bold paragraph breaks.
- **Numbered lists for procedures.** Steps 1, 2, 3 — not "First, then, finally..."
- **Bullets for alternatives.** When X do A, when Y do B.
- **Tables for matrices.** Mapping types/cases to outcomes.
- **No introductory preamble** before the first useful line.
- **Imperative mood throughout.** "Read the file." not "You should read the file."

## When to include "Why"

- **Safety/security rules:** Yes — Why anchors generalization. One sentence max.
- **Style/convention rules:** No. The imperative is the rule. Drop incident anecdotes.
- **Skills:** Almost never. The description field is the Why; the body is the How.

## Anti-patterns

- **Glossaries inline >10 lines** in a SKILL.md. Move to `REFERENCE.md` sibling.
- **Incident anecdotes** in style rules. Cut for style; keep one-line for safety rules where the incident anchors generalization.
- **Repeating the description** in body intro paragraphs.
- **Frontmatter descriptions over 1 sentence** or repeating the name.
- **Combining unrelated rules** in one file when they could split cleanly.

## Examples to model (already on this machine)

- `superpowers/executing-plans/SKILL.md` — Overview → numbered Process steps, no preamble. Terse-skill model.
- `~/.claude/skills/commit-messages/SKILL.md` — tables + numbered process. Moderate-skill model.
- `~/.claude/rules/keep-comments.md` (after rewrite) — review-gate pattern. Behavior-shaping rule model.

## Audit checklist (used by step 3 of the skill)

When sweeping `~/.claude/rules/` or `~/.claude/skills/`:

1. Length over target? → Trim or split candidate.
2. Frontmatter description >1 sentence? → Trim candidate.
3. Why section in style rule? → Restructure candidate.
4. Glossary in skill body >10 lines? → Reference-extract candidate.
5. Narrative paragraphs where steps would work? → Restructure candidate.
6. Two unrelated rules combined? → Split candidate.
