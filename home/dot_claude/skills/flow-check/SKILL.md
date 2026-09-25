---
name: flow-check
description: Finds what this session decided, left open, or built that has no durable home yet, and names the Matt-flow command each thread needs next, specs first. Use before clearing or compacting a long session, or when resuming one.
disable-model-invocation: true
---

# Flow check

The conversation is the input. The tracker, git and the PR host are checked only for items the conversation raised. This skill finds and routes; the user runs the flow skills it names.

Stages and the skill for each: `~/.claude/plugins/marketplaces/mattpocock/skills/engineering/ask-matt/SKILL.md`.

1. List every **item** in this conversation: each decision made, question left open, piece of work done or promised, and term coined. Done when every user request and every agent proposal maps to an item.
2. For each item, find where it is **captured**: tracker issue, PR, pushed commit, ADR, or `CONTEXT.md` entry, in whichever repo or tracker the item belongs to, not only this project's. Write `uncaptured` only after the lookup ran; find PRs by source branch. Tracker commands: the project's `docs/agents/issue-tracker.md`.
3. Group uncaptured items by **thread**. Answer with one table per thread: item, stage. Work that exists only on this machine goes first. Then one line of captured items with where each lives, then ask: "Push local-only work?"
4. On yes, push each local-only branch. Nothing else runs.
5. For each uncaptured thread, name what it needs and the command to type, by ask-matt's main flow:
   - needs a spec (multi-session work, or open questions): `/grill-with-docs <thread>`, then `/to-spec`, then `/to-tickets`
   - a term or a lasting decision: `/grill-with-docs` records it in `CONTEXT.md` or an ADR
   - one settled piece of work: `/implement`

   Where the project maps a command to its own variant, give that name. Order the list by risk of loss, then the thread with the most open questions. Finish with the continue, clear or compact call from ask-matt's `PHASE-BOUNDARIES.md`.
