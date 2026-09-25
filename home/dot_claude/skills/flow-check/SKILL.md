---
name: flow-check
description: Finds what this session decided, left open, or built that the tracker doesn't hold yet, and captures it so the session is safe to clear. Use before ending or clearing a long session, or when resuming one.
disable-model-invocation: true
---

# Flow check

The conversation is the input. The tracker, git and the PR host are checked only for items the conversation raised. Capturing an item puts it on the tracker; deciding what it needs (spec, ADR, nothing) happens later, in `/grilling` on that issue.

Stages and the skill for each: `~/.claude/plugins/marketplaces/mattpocock/skills/engineering/ask-matt/SKILL.md`.

1. List every **item** in this conversation: each decision made, question left open, piece of work done or promised, and term coined. Done when every user request and every agent proposal maps to an item.
2. For each item, find where it is **captured**: tracker issue, PR, commit on a pushed branch, ADR, or `CONTEXT.md` entry. Write `uncaptured` only after the lookup ran; find PRs by source branch. Tracker commands: the project's `docs/agents/issue-tracker.md`.
3. Group uncaptured items by **thread**. Answer with one table per thread: item, stage. Work that exists only on this machine goes first. Then one line of captured items with where each lives, then ask: "Capture all?"
4. On yes, capture: push each local-only branch; file one tracker issue per thread, its items as a checklist, labelled `needs-triage`. Done when every item has a home.
5. Finish with `Safe to /clear: yes` and `Next: /grilling <issue>` for the thread with the most open questions.
