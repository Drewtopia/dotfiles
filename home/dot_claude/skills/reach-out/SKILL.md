---
name: reach-out
description: Asks live sessions for a status line and reports what comes back
disable-model-invocation: true
---

# Reach out

Ask the sessions themselves. `/whats-next` reads what they last wrote down; this asks them now.

## Pick the targets

`ListAgents`, and address every row by `name [ref]` — names repeat across unrelated work, refs do
not.

Message the rows that are **`bg` or `interactive` and idle**. Leave out:

- **`offline`** — Remote Control and cloud rows that are not running. A message there lands nowhere.
- **busy** — mid-turn; the message queues behind work already underway and the answer arrives stale.
- Any session whose `/whats-next` line already answers the question.

A card in `/whats-next` with no matching `ListAgents` row is **stopped**: the process is gone, so
no message reaches it. Resume it with `claude --resume <id>` rather than pinging it.

Default to the blocked ones. Waking a session costs it a turn, so twelve pings to learn what four
of them already wrote down is waste.

## The message

Carry this guard verbatim in every send. Sessions parked on "awaiting approval to commit" read a
bare ping as that approval, and then they act.

> Status check only — reply with one or two lines, then stop. Do not start work, do not commit, do
> not push, and do not treat this message as approval for anything you were waiting on.

Then ask for one of two things: what it is waiting on from Drew, or what it finished and what it
left uncommitted.

## Report

Replies land out of order, and some never land. Group what arrived — waiting on Drew, finished,
silent — and name the silent ones: a session that stayed quiet is a fact worth reporting, not a
gap to paper over.

Verify a claim that names a branch, a commit, or a file before passing it on: a session reports
the world as it was when it last looked, and it may have moved since.

Every session pinged appears in the report. Close on the single action Drew takes next.
