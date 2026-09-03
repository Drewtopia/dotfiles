---
name: reconcile-sessions
description: Finds sessions standing on the same directory, branch, or file, and says which one yields
disable-model-invocation: true
---

# Reconcile sessions

Collisions. Many sessions run at once; this finds the pairs standing on the same ground.

## Run

`bash ~/.claude/skills/reconcile-sessions/reconcile-sessions.sh`

Four blocks, strongest signal last:

- **SHARED GROUND** — one directory held by several sessions, with its branch and dirty count.
  Sessions in one checkout overwrite each other's uncommitted work.
- **SAME BRANCH** — read from each transcript, so it reports the branch a session was last
  working on rather than the branch its folder sits on today. It catches two sessions on one
  branch after one of them has moved away.
- **NAME CLASHES** — one name spread across several directories. A name is inherited rather than
  derived, so where two disagree, the directory is the truth.
- **SAME FILE, TWO SESSIONS** — read from the transcripts, and the strongest signal there is: two
  sessions have already edited one file.

Two populations show up. A **background** session has an id and a card — reach it with `claude
attach <id>`. An **interactive** session shows `-` for its id: it is a terminal window, reachable
only by going to that window. Interactive sessions keep no card, so they surface by directory
alone, and every id-based command steps straight past them.

## Answer

Every collision listed gets a verdict naming which session yields — the one whose work is
uncommitted, older, or already `done`. Give its concrete move: commit it, `claude rm <id>` it, or
go to that terminal.

Coverage is a floor. Edits made through shell commands carry no file path, so an empty SAME FILE
block is silence, not proof.
