---
name: housekeeping
description: Router for the cleanup skills — which to run when, plus the full-sweep flow that runs them all and emits one report.
disable-model-invocation: true
---

# Housekeeping

The map over the cleanup skills. You don't remember them all — start here.

## Which to run

- **Machine feels cluttered** — worktrees, Agent View cards, stale sessions → **`/clean-workspace`**.
  Fast, deterministic, run often.
- **Backlog drifted from reality** — merged work still open, tickets obsoleted by a pivot →
  **`/reconcile-tracker`**. Slower; run occasionally.
- **Docs drifted from decisions** — ADRs/CONTEXT contradicting each other, the code, or a closed
  ticket; dangling references → **`/audit-intent`** *(project-local — install per repo)*. Reports
  only; run after a pivot or revert.
- **Lost a past session, or cleared a card by mistake** → **`/find-session <memory>`** (recall) or
  **`/find-session --removed`** (recover a cleared card).

## Full sweep

Everything at once, one report:

1. Compute the done set once — `bash ~/.claude/skills/_lib/merged-set.sh` — both cleanups reuse it.
2. Run the **`/clean-workspace`** flow ([its SKILL.md](../clean-workspace/SKILL.md)) — worktrees +
   Agent View + stale tail.
3. Run the **`/reconcile-tracker`** flow ([its SKILL.md](../reconcile-tracker/SKILL.md)) — reconcile
   + supersession + burn-down.
4. Write one self-contained HTML report to the scratchpad (inline CSS, no framework/bundler),
   `xdg-open` it, print the `file://`. Panels: burn-down · actions taken · proposals
   (worktrees / sessions / supersession / close-or-kill). Restrained styling, one accent, no animation.

These skills are user-invoked, so this router **describes and sequences** them; the sweep follows
each sub-skill's documented steps in order rather than firing them as tools.
