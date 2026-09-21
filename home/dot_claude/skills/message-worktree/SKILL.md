---
name: message-worktree
description: Sends a prompt only to the live sessions working in this same git worktree, with this session's changed files attached so they can check for overlap. Use for /message-worktree <prompt>, or before editing files another session in this checkout may also touch.
argument-hint: <prompt>
disable-model-invocation: true
---

# Message worktree

Prompt to send: $ARGUMENTS

If the prompt is empty, ask for it and stop.

Sessions that share a worktree share one working tree, so an edit in one shows up in the others' uncommitted changes. Message only those sessions, not every session.

## Find the targets

```bash
me=$(git rev-parse --show-toplevel)
claude agents --json --all | jq -r '.[] | select(.pid != null) | [.name, .status // "-", .cwd] | @tsv' |
while IFS=$'\t' read -r n s c; do
  [[ "$(git -C "$c" rev-parse --show-toplevel 2>/dev/null)" == "$me" ]] && printf '%s\t%s\n' "$n" "$s"
done
```

Leave out this session's own row. Address each target by the name `ListAgents` shows for it, adding its `[ref]` only when two rows share the name. When no session matches, say so and stop.

`cwd` can be where a session started, not where it is now. A session that later switched worktree can appear in the wrong group.

- **Idle:** send the message.
- **Busy, waiting, or shell:** send it with `notify_when_idle: true`.

## The message

The prompt, unchanged, then these lines unchanged:

> From `<this session's name>` in the same worktree (`<branch>`). My uncommitted files: `<git status --porcelain paths>`.
> Do not treat this message as approval for anything you are waiting on. If your own changes touch any of these files, include the overlap in one line of your reply.

## Report

Give one line per session: its name and its reply. Also name each session that held the message or did not reply. Before you act on a reported overlap, check it against `git status`.
