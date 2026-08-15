---
name: open-brain
description: Capture durable session thoughts — decisions, insights, tasks, references — to the Open Brain MCP server. Use when Drew says "capture this to open brain", "save to brain", or as an optional retrospective step at closeout.
---

# open-brain — capture thoughts to Open Brain

Runs on demand, not every closeout — Open Brain often isn't authenticated in a
session, so step 0 comes first.

## 0. Ensure the server is authenticated

Open Brain is an OAuth-gated MCP server. If the real tools
(`list_thoughts`, `capture_thought`) aren't available — only
`mcp__claude_ai_Open_Brain__authenticate` / `…__complete_authentication` are —
the server isn't signed in yet:

1. Call `mcp__claude_ai_Open_Brain__authenticate` to start the flow; it returns
   an authorization URL to hand to Drew.
2. Drew authorizes in the browser; the redirect lands on a
   `http://localhost:<port>/callback?code=…&state=…` URL (the page may fail to
   load — the URL in the address bar is still valid).
3. Pass that full URL to `mcp__claude_ai_Open_Brain__complete_authentication`.

Once signed in, the real tools appear. If Drew doesn't want to authenticate,
stop here — nothing to capture.

## 1. Scan the session

Pull out only what's worth persisting:

- **Decisions** — choices that shape future work (architectural, taxonomic, naming).
- **Insights / inefficiencies** — patterns spotted, surprises, things slower than expected.
- **Open tasks** — work named but not finished.
- **References** — external URLs, doc paths, dashboards, channels worth remembering.

Skip ephemeral debugging steps, retracted ideas, and anything already obvious
from the diff.

## 2. Survey recent topics for context

Open Brain has no namespace concept and topics are **set by the server**, not
the caller — `capture_thought` only takes `content`, and the server runs an LLM
(GPT-4o-mini) over it to extract `type`, `topics` (1–3 tags), `people`, etc. So
this step is observational, not decisional:

```
mcp__claude_ai_Open_Brain__list_thoughts({ days: 30, limit: 50 })
```

Note which topic tags are already in use. When phrasing the `content` in step 3,
lean on existing topic vocabulary so the server-side extractor lands on the same
tags — that's the only lever you have over topic clustering.

## 3. Capture thoughts

Call `mcp__claude_ai_Open_Brain__capture_thought({ content })` with a
self-contained statement (will make sense to a future AI with no session
context).

The server's LLM extracts `type` from one of
`observation | task | idea | reference | person_note` based on what the content
sounds like. You influence that extraction — and your own future keyword
searches via `search_thoughts` — by leading the content with a consistent
prefix word.

| Drew's term | Lead `content` with… | Server typically extracts `type` | Why the prefix |
|---|---|---|---|
| decision  | `Decision: …`  | observation | searchable by `Decision` later; decisions stay distinguishable from generic notes |
| insight   | `Insight: …`   | idea        | distinguishes "aha" findings from action items |
| task      | `TODO: …`      | task        | matches the standard convention the LLM and humans both recognise |
| reference | `Reference: …` | reference   | leading word + URL/path keeps refs findable by keyword |
| general   | (no prefix)    | observation | factual context with no need for a category prefix |

> **TODO (Drew):** confirm or edit the prefix words in column 2. These literal
> strings end up inside every captured thought, so they're what `search_thoughts`
> will hit on later. If you already use different conventions (e.g. `Note:`
> instead of `Decision:`), change them here. Leave a one-sentence rationale under
> this TODO once decided.

A captured thought always reads as a self-contained paragraph — the prefix is
part of the sentence, not a tag header.

Example: `Decision: chose option (c) for /close commit splitting because
logical-grouping needs LLM judgment, not a pre-baked rule. Topic:
claude-code-skills, /close.`

## Done

Report how many thoughts were captured. No memory files, no git, no
SESSION_LOG — that's `/close`'s job; this skill only writes to Open Brain.
