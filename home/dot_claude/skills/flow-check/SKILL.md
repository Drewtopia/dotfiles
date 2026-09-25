---
name: flow-check
description: Finds what this session decided, left open, or built that has no durable home yet, and captures each thread through the skill ask-matt routes it to. Use before clearing or compacting a long session, or when resuming one.
disable-model-invocation: true
---

# Flow check

The conversation is the input. The tracker, git and the PR host are checked only for items the conversation raised. The inventory is this skill's own job; every artifact comes from an existing skill.

Stages and the skill for each: `~/.claude/plugins/marketplaces/mattpocock/skills/engineering/ask-matt/SKILL.md`.

1. List every **item** in this conversation: each decision made, question left open, piece of work done or promised, and term coined. Done when every user request and every agent proposal maps to an item.
2. For each item, find where it is **captured**: tracker issue, PR, commit on a pushed branch, ADR, or `CONTEXT.md` entry. Write `uncaptured` only after the lookup ran; find PRs by source branch. Tracker commands: the project's `docs/agents/issue-tracker.md`.
3. Group uncaptured items by **thread**. Answer with one table per thread: item, stage. Work that exists only on this machine goes first. Then one line of captured items with where each lives, then ask: "Capture all?"
4. On yes, push each local-only branch. If the session is past ask-matt's smart zone, make the continue, clear or compact call from its `PHASE-BOUNDARIES.md` first. Then capture each thread through the skill ask-matt routes it to, in this context. Use the project's `-project` variant where one exists, and invoke it with the Skill tool. A skill marked `disable-model-invocation` is the user's to run: stop and give them the exact command to type.
   - open questions: `/grill-with-docs`, then `/to-spec`
   - settled and multi-session: `/to-spec`, then `/to-tickets`
   - a term or a lasting decision: `/domain-modeling`
   - one settled piece of work: `/to-tickets` for a single ticket, or `/implement`
   - personal config: the vault plan

   Done when every item sits in an artifact a skill produced.
5. Finish with `All captured: yes` and the continue, clear or compact call from `PHASE-BOUNDARIES.md`.
