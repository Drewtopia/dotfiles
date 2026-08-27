# Style guide for rules and skills

Reference for the `audit-rules-and-skills` skill. Distilled from:

- [Anthropic: Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (canonical)
- [Anthropic Claude Code docs: Memory](https://code.claude.com/docs/en/memory)
- Jose Parreño Garcia's substack ("How Claude Code rules actually work")
- karanb192/awesome-claude-skills, HumanLayer's "Writing a good CLAUDE.md"
- Audit of well-shaped rules and skills already on disk (see Examples below)

## Concision principle

Anthropic's first rule: *"Default assumption: Claude is already very smart. Only add context Claude doesn't already have."* Challenge each piece of content with three questions:

1. Does Claude really need this explanation?
2. Can I assume Claude knows this?
3. Does this paragraph justify its token cost?

If the answer to #1 is no, or #2 is yes, or #3 is no — cut it.

## Resident vs lazy — classify before measuring

Line count is not what you pay for. Only *resident* content bills every session; lazy content bills on use. Classify each target first, then rank findings by class.

| Target | Resident every session | Loads on demand |
|---|---|---|
| Rule with no `paths:` | whole file | — |
| Rule with `paths:` | — | whole file, when a matching file is read |
| Skill | `name` + `description` | body, `REFERENCE.md`, other siblings |
| Skill with `disable-model-invocation: true` | nothing — absent from the model's skill listing | everything, on `/name` |

Per the docs: *"Rules without a `paths` field are loaded unconditionally… Path-scoped rules trigger when Claude reads files matching the pattern, not on every tool use."* And: *"skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked."*

Two consequences that invert naive line-count auditing:

- A bloated **description** is worse than a bloated body. It bills every session *and* is the entire routing signal.
- A long `paths:`-scoped rule or skill body is cheap. Over budget there is a readability finding, not a context finding — rank it below every resident one.

## Length budgets

| Type | Target lines | Hard cap |
|---|---|---|
| Resident rule (no `paths:`) | 9–25 | 40 |
| Path-scoped rule | 9–40 | 60 |
| Terse skill | 50–80 | 100 |
| Moderate skill | 100–150 | 200 |
| Long skill (rare) | 150–250 | 500 |
| `CLAUDE.md` | ≤120 | 200 |

500 lines is Anthropic's official SKILL.md ceiling — anything beyond should split into reference files. Our targets are tighter as a quality bar. A resident rule over 25 lines, or a skill over 200, is a candidate for split, trim, or move-to-reference-file.

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

## Examples to model

- `~/.claude/skills/audit-skill-repos/SKILL.md` — frontmatter is `name` + `description` only, description opens with "Use when…", no preamble. Terse-skill model.
- `~/.claude/rules/comment-discipline.md` — three short paragraphs, one concern each. Behavior-shaping rule model.

Exemplars rot. Confirm each is on disk and, for plugin-provided ones, that the plugin is still enabled in `home/.chezmoidata/claude.toml`.

## Audit checklist (used by step 3 of the skill)

When sweeping `~/.claude/rules/` or `~/.claude/skills/`:

1. Does the description say **when** to use this, not just what it does? → Rewrite candidate. Highest priority: it is resident *and* it is the routing signal, so a vague one costs every session and still fails to fire.
2. Length over target **for its class**? → Trim or split candidate. Weight resident targets above lazy ones.
3. Frontmatter description >1 sentence, or repeating the name? → Trim candidate.
4. Why section in style rule? → Restructure candidate.
5. Glossary in skill body >10 lines? → Reference-extract candidate.
6. Narrative paragraphs where steps would work? → Restructure candidate.
7. Two unrelated rules combined? → Split candidate.
8. Rule always-loaded that only matters for one file type? → Add `paths:` and move it to lazy.
