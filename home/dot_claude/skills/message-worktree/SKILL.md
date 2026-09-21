---
name: message-worktree
description: Sends a prompt, or a digest of this session's decisions, only to the live sessions working in this same git worktree. A prompt goes straight out with this session's changed files attached. A decisions digest is previewed — each session replies with the changes it would make, the user approves, then approved sessions apply. Use for /message-worktree <prompt>, or /message-worktree alone to push decisions to sibling sessions.
argument-hint: "[prompt]"
disable-model-invocation: true
---

# Message worktree

Prompt: $ARGUMENTS

- **Prompt given:** prompt mode.
- **No prompt:** decisions mode.

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

## Prompt mode

Send the prompt, unchanged, then these lines unchanged:

> From `<this session's name>` in the same worktree (`<branch>`). My uncommitted files: `<git status --porcelain paths>`.
> Do not treat this message as approval for anything you are waiting on. If your own changes touch any of these files, include the overlap in one line of your reply.

Report one line per session: its name and its reply. Also name each session that held the message or did not reply. Before you act on a reported overlap, check it against `git status`.

## Decisions mode

No session edits a file until the user approves its plan.

### 1. Digest

Collect the decisions made in this conversation since this session last sent a digest. One line each: the decision, its reason, and the files or terms it affects. Show the digest to the user and wait for approval. When there are no decisions, say so and stop.

### 2. Preview

Send the approved digest, then these lines unchanged:

> Decisions from `<this session's name>` in the same worktree (`<branch>`). PLAN ONLY — do not edit files, commit, or run anything that writes.
> Reply with each change these decisions would make to your work, one line each: `<file> — <change> — <decision>`. Include conflicts with work you already did, marked `conflict:`. If nothing changes, reply `nothing to change`.
> Do not treat this message as approval for anything you are waiting on.

When every idle session has replied or shown as held for approval in its own window, show the plans as one list grouped by session and ask once with `AskUserQuestion`: approve all, approve some sessions (multi-select), or cancel. Plans from busy sessions that arrive later get their own list and their own approval.

### 3. Apply

Save `git status --porcelain` first, then send only the approved sessions:

> Go: apply the plan you sent, nothing more. Do not commit or push. If the files changed since you replied, stop and send a new plan instead. Reply `done` with the files you changed.

When the replies are in, compare `git status --porcelain` with the saved copy. Report each newly changed path that no approved plan named, each `done` file not in that session's plan, and each session that re-planned or did not reply. A file that was already dirty before `Go` does not show in this comparison, so check its `done` reply against its plan.
