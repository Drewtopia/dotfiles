---
name: whats-next
description: Triages every background session and names the one to walk back into
disable-model-invocation: true
---

# What's next

Triage. Many sessions are open; exactly one gets acted on now.

## Run

`bash ~/.claude/skills/whats-next/whats-next.sh`

Reads the session roster and each card's saved state — wakes no session, changes nothing. What
the output does not confess about itself:

- Under **BLOCKED**, `detail` is the literal question that session asked. Quote it; re-deriving
  it wastes the wait time it already spent.
- Under **DONE**, `detail` is the result headline, not yet acted on.
- **TREES** is deduped, because many sessions share one checkout. A row reading `terminal:` is
  an interactive session: no card, no id, reachable only from its own window. Unsaved work
  belongs to a tree; a card holds none.

That output is your input. Write the answer in your own words — the reader typed `/whats-next`
because a list is what defeated them.

## Answer

The oldest unanswered question wins. Reply in this shape:

> **Next:** one sentence — the decision to make or the thing to check
> `claude attach <id>`
> **Then:** at most three other ids, one line each

Give the wait time; it is the argument for the pick. Give exactly one action, then stop. With
nothing blocked, say that in one line and stop.

## What to do with a DONE card

Say that removal is safe, every time — it is the sentence that unsticks the reader. `claude rm
<id>` deletes the card, keeps the transcript (`claude --resume <id>`, or `/find-session
--removed`, until `cleanupPeriodDays` expires it), and deletes a worktree only when that is
safe, never one holding uncommitted or unpushed work.

| The result line says | Do |
|---|---|
| It landed — merged, written, verified — and flags nothing | `claude rm <id>` |
| A decision is waiting on you — "flagged", "awaiting", "two decisions" | attach, decide, then `rm` |
| It names a file or branch you haven't looked at | `claude logs <id>` to read the tail, open the file, then `rm` |
| Older than a week, and you can't recall why it existed | `claude rm <id>` — it is recoverable |

Every DONE card ends with a verb from that table. Clearing more than three at once is
`/clean-workspace`; recovering one cleared by mistake is `/find-session --removed`.
