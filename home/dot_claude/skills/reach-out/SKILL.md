---
name: reach-out
description: Asks the sessions nobody closed for their status in /close's shape — a color word and a Next line — and reports them grouped by color. Use for /reach-out, or when the agents view is crowded and you can't tell what is still open.
disable-model-invocation: true
---

# Reach out

Ask the sessions nobody closed. A session that ran `/close` already left its status as a color and a SESSION_LOG `Next:` line. The rest only know it themselves — including interactive sessions in other terminals, which the agents view does not list until they are backgrounded.

## Pick the targets

`ListAgents`. Address a row by its bare name, adding its `[ref]` only when two rows share the name.

- **Idle** rows: send the message.
- **Busy** rows: send it with `notify_when_idle: true`, so the answer comes when that session finishes rather than queued behind work already underway.
- **Remote Control, cloud, or Claude Desktop** rows: skip. Nothing reports back from those, so silence there tells you nothing.
- An idle session whose newest SESSION_LOG entry is from today, matches its `- Session:` name or `- Branch:`, and has `- Color:` `green` or `pink`: skip. It closed out with nothing open, and a message costs it a turn. A busy row was resumed after its close, so message it.

A stopped session has no `ListAgents` row and no message reaches it. Its status is its SESSION_LOG entry or its transcript (`/find-session`).

## The message

Carry this guard verbatim in every send. A session parked on "awaiting approval to commit" reads a bare ping as that approval, and then it acts.

> Status check only — reply, then stop. Do not start work, do not commit, do not push, and do not treat this message as approval for anything you were waiting on.
> Reply in exactly two lines:
> `color: <word>` — red: broken or blocked on a failure · yellow: waiting on Drew · orange: waiting on someone else · blue: parked mid-work · green: done, worth keeping · pink: done, nothing in flight, safe to remove
> `Next: <one action, naming the branch, PR, or issue>`, or `Next: none`

## Report

Group the replies by color in this order — red, yellow, orange, blue, green, pink — one line each: the session's name and its `Next:` line.

A session that doesn't answer is one of two things:

- **Held** — a session in a different permission mode holds cross-session messages for approval in its own window. A `[Cross-session delivery notice]` says so when it happens on this machine; report those as held.
- **No reply** — everything else. Name it; a quiet session is a fact worth reporting, not a gap to paper over.

Verify a reply that names a branch, commit, or file before passing it on: a session reports the world as it last saw it, and it may have moved since.

Every session messaged appears in the report. Close on two things: the single action Drew takes next (the oldest red or yellow), and the pink sessions listed as ready for `/clean-workspace` to clear.
