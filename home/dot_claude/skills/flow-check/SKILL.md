---
name: flow-check
description: Places each thread of work in this conversation on the idea-to-ship flow and names the one skill to run next. Use when resuming a long or older session.
disable-model-invocation: true
---

# Flow check

The stages come from the main flow in `~/.claude/plugins/marketplaces/mattpocock/skills/engineering/ask-matt/SKILL.md`. Read it first; it is the source of truth for stage order and which skill serves each stage.

1. Name every **thread** of work in this conversation. Done when each user request maps to a thread.
2. For each thread, fill one row with **evidence** per stage, read live from the tracker, git and the PR host:
   - grill: decisions settled, questions still open
   - domain: terms used here but missing from `CONTEXT.md`; decisions with no ADR
   - spec: PRD issue number and state
   - tickets: sub-issues open and closed, blocking edges
   - implement: branch and PR per ticket, merged or not, reviewed or not

   Done when every cell holds an ID, a link, or `none`.
3. Name the **frontier**: tickets whose blockers are closed, plus any gap that stops a stage (an open question, a ticket with commits but no PR, a missing blocking edge).
4. Answer with the table, then one line: `Next: /<skill> <target>`.

Tracker and PR-host commands come from the project's `docs/agents/issue-tracker.md`.
