---
name: housekeeping
description: Map over the cleanup and closeout skills — which one to reach for when the machine feels cluttered, the backlog has drifted, a session needs wrapping up, or a past session has gone missing. Use when the right cleanup skill isn't obvious, or the user asks what exists.
---

# Housekeeping

The map over the cleanup skills. You don't remember them all — start here.

Every skill below is user-invoked. Name the right one and hand it over; this file routes, it
does not run the work.

| Reach for it when | Skill |
|---|---|
| Too many sessions open to know what to do next | **`/whats-next`** — one next action, plus what to do with the finished cards |
| The machine feels cluttered — merged worktrees, finished Agent View cards, unnamed sessions | **`/clean-workspace`** — fast, deterministic, run often |
| Work has merged but its issues are still open | **`/reconcile-tracker`** — walks merged PRs to close what they closed |
| The whole backlog has drifted — ghosts, inflated counts, planless tickets | **`/realign-tracker`** — sweeps every open issue; slower, run periodically |
| A session is ending — memory, commits, session log | **`/close`** |
| A past session is lost, or a card was cleared by mistake | **`/find-session <memory>`**, or **`/find-session --removed`** to recover a cleared card |
| Docs have drifted from decisions — ADRs contradicting the code or each other | **`/audit-intent`** — project-local, install per repo; reports only |

The two tracker skills differ by **reach**, not by quality: `reconcile-tracker` starts from merged
work and closes the issues behind it, `realign-tracker` starts from every open issue and checks it
for drift. `close` reconciles only the branches of the session it is closing.
