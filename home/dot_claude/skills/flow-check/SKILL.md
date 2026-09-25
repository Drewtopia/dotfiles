---
name: flow-check
description: Finds what this session decided, left open, or built that has no durable home yet, and where each belongs on the idea-to-ship flow. Use before ending or clearing a long session, or when resuming one.
disable-model-invocation: true
---

# Flow check

The conversation is the input. The tracker, git and the PR host are checked only for items the conversation raised.

Stages and the skill for each: `~/.claude/plugins/marketplaces/mattpocock/skills/engineering/ask-matt/SKILL.md`.

1. List every **item** in this conversation: each decision made, question left open, piece of work done or promised, and term coined. Done when every user request and every agent proposal maps to an item.
2. For each item, find where it is **captured**: tracker issue, PR, commit, ADR, or `CONTEXT.md` entry. Write `uncaptured` only after the lookup ran. Tracker commands: the project's `docs/agents/issue-tracker.md`.
3. For each uncaptured item, name its home and the skill that puts it there:
   - open question: `/grilling` now, or an issue
   - settled decision with lasting reach: ADR via `/domain-modeling`
   - new term: `CONTEXT.md` via `/domain-modeling`
   - work bigger than one session: `/to-spec`, then `/to-tickets`
   - one piece of work: an issue, or `/implement` now
   - nothing lasting: `drop`
4. Answer with one table: item, stage, captured in (or `uncaptured`), proposed home. Uncaptured rows first. Then one line: `Next: /<skill> <target>`.
