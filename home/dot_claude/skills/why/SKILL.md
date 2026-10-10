---
name: why
description: Recover why code is the way it is — the decision behind it, the alternative rejected, the constraint that forced it. Searches version-control history and whatever PR host and issue tracker the project uses, in parallel, then answers with every claim graded by how well the record actually supports it. Use for "why is this like this", "why did we pick X", "why does this guard exist", before deleting something that looks pointless, or when a comment claims something the code does not show.
disable-model-invocation: true
---

# Why

Code shows what it does. It never shows what it was chosen over. That lives in commits,
PRs, tickets and review threads — all partial, all biased, some missing. This skill goes
and reads them, and is honest about which parts of the answer the record supports.

For how something works, use a code-exploration skill or agent. This one is only for motive.

## The core discipline: grade every claim

Every statement in the answer carries a tier. The tier decides the wording, so a reader
can tell evidence from inference without redoing the search.

| Tier | Means | Phrase it |
|---|---|---|
| **Direct** | Someone *wrote* the reason down. A PR body, a ticket, an acceptance criterion, a commit message. | "This exists because X." Cite it. |
| **Supported** | No one source says it, but several converge. | "The evidence points to X: [the pieces]." Cite each. |
| **Inferred** | Your reading of the context. Nothing states it. | "Likely X, because A and B." Show the chain. |
| **Speculative** | Plausible, thin, other readings fit too. | "One possibility is X — no contemporary evidence found." |
| **Unknown** | Searched, found nothing. | Say so. This is a finding, not a failure. |

A confident-sounding guess is the failure mode this skill exists to prevent. Never promote
a tier to make the answer feel finished. **Never quote a source you did not open** —
paraphrase is where fabricated citations get in.

## Step 1 — anchor

Pin the target to something searchable before looking anywhere: file paths, the exact
symbol, the line range, and the distinctive string if a comment or literal is involved.
If the question is vague, state your best-guess reading in one line and proceed — do not
stop to ask.

## Step 2 — find this project's evidence sources

Version control is always available. Everything else varies, so **establish it, do not
assume it**: PRs may live on GitHub, Azure DevOps, GitLab or nowhere; issues may live in
the same repo, a different repo, or a separate tracker with its own auth.

Read the repo's own agent instructions first — `AGENTS.md` or `CLAUDE.md`, plus whatever
they point at. A project that documents its tracker will say so there (a
`docs/agents/issue-tracker.md`, a contributing guide, a decision-sources note), including
the flags and env vars its commands need. **That doc is authoritative; do not re-derive
what it already states, and do not restate it back to the user.**

**If `docs/agents/decision-sources.md` is missing, tell the user to run `/setup-drews-skills`** —
it probes the machine once and writes that file. Then continue this run anyway, inferring
what you can: `git remote -v` for the host, `git symbolic-ref refs/remotes/origin/HEAD`
for the trunk, CI config for what gates a merge. Say in your output that you worked
without a documented source map, because that materially lowers confidence in a **null**
result — you may simply have searched the wrong place.

MCP tools appear as `mcp__<server>__<tool>`. Some are deferred and appear by
name only — call `ToolSearch` with a category keyword before ruling a source out. A server
reported as failed-to-connect is a connection failure, not an absent capability: record it
as unsearched, never as unavailable.

## Step 3 — investigate in parallel

Dispatch one subagent per source, in a single message. One agent per source: each needs a
different query vocabulary, and a combined prompt returns shallow results for all of them.
Give every agent the anchor, the question, and the rule that a **null result is a
reportable finding** — that a decision was never ticketed is itself evidence.

Use `subagent_type: Explore` (read-only). Investigators read; they never write, commit, or
mutate anything.

### Version control — always available

```bash
git log -L <start>,<end>:<file> --oneline               # what wrote these exact lines
git log -S '<distinctive string>' --oneline -- <file>   # when the string appeared/vanished
git log --follow -p -- <file>                           # survives renames; plain log does not
git show <sha>                                          # the message is the evidence, not the diff
```

Confirm the trunk name rather than assuming `main`. Squash merges mean one commit often
carries a whole PR — read its full message, not the subject. A rename breaks naive
history, so reach for `--follow` early.

### The PR host

Whatever it is, the **reviewer comment threads are the richest and most-missed source**.
A rejected approach usually dies in a thread and never appears in the description. Fetch
threads explicitly; most CLIs omit them from the default view.

### The issue tracker

Read comments, not just bodies — scope changes get argued in comments and are rarely
edited back into the description. Where tickets nest, a child is tactical: walk up to the
parent for intent. Search by domain noun as well as by ID; an ID search alone
under-reports badly.

### Add, if the code looks defensive

A null check, retry, timeout, rate limit, feature flag or egress guard was almost always
written *at* something. Search for an incident in the weeks before the commit landed. A
project's decision records and any mistakes log are written records of exactly this.

## Step 4 — synthesise

You do this yourself — do not delegate the judgement.

1. Assemble every finding with its citation.
2. Grade each claim by the tier table. Where sources conflict, **report the conflict**;
   do not silently pick the one that fits.
3. Spot-check any citation you are about to quote by opening it again.

## Output

- **The answer** — two or three sentences, plainly, leading with the tier's honesty.
- **What was decided against**, when the record shows it. This is the highest-value output
  and the reason to run this at all.
- **Constraints still live** — anything that would break if the code changed. If the
  question preceded a change, say Preserve / Change / Avoid.
- **Evidence** — one line per source: identifier, what it said, tier.
- **Coverage** — every source searched, including the ones that returned nothing, and any
  source unavailable this session. An unsearched source reported as clean is the one
  outcome that makes this skill worse than useless.

When the record genuinely does not say, the answer is "the record does not say", plus what
you searched. That is a complete and useful result.
