---
name: sync-worktrees
description: Keeps parallel worktree sessions in step. Maps which branches change the same files, sends a prompt to the sessions that share files with this one, or pushes this session's decisions to them with a preview-then-approve flow and a check for which decisions belong in AGENTS.md, CONTEXT.md, or an ADR. Use for /sync-worktrees --map, /sync-worktrees <prompt>, or /sync-worktrees alone to push decisions.
argument-hint: "[--map | prompt]"
disable-model-invocation: true
---

# Sync worktrees

Argument: $ARGUMENTS

- **`--map`:** map mode. Report only; message nobody.
- **Any other text:** prompt mode.
- **Nothing:** decisions mode.

Each worktree is its own working tree, but branches that change the same file will conflict at merge, and a decision made in one session is unknown to the rest.

## Changed files per branch

```bash
base=$(git symbolic-ref --short refs/remotes/origin/HEAD)
out=$(mktemp)
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r w; do
  b=$(git -C "$w" branch --show-current)
  [[ -z "$b" ]] && continue
  if [[ "origin/$b" == "$base" ]] || git -C "$w" merge-base --is-ancestor HEAD "$base"; then
    mb=HEAD
  else
    mb=$(git -C "$w" merge-base "$base" HEAD) || continue
  fi
  { git -C "$w" diff --name-only "$mb"; git -C "$w" ls-files -o --exclude-standard; } | sort -u | sed "s|^|$w\t$b\t|"
done > "$out"
```

`$out` holds one `worktree<TAB>branch<TAB>file` row per changed file: committed since the branch left the default branch, uncommitted, and untracked. For the default branch and fully merged branches, only uncommitted and untracked files count. A squash-merged branch is not an ancestor, so its commits still count; say so when a branch's PR is already merged. When `origin/HEAD` is unset, run `git remote set-head origin -a` first.

## Live sessions per worktree

```bash
claude agents --json --all | jq -r '.[] | select(.pid != null) | [.name, .status // "-", .cwd] | @tsv' |
while IFS=$'\t' read -r n s c; do
  printf '%s\t%s\t%s\n' "$(git -C "$c" rev-parse --show-toplevel 2>/dev/null)" "$n" "$s"
done
```

Address a session by the name `ListAgents` shows, adding its `[ref]` only when two rows share the name. `cwd` can be where a session started, not where it is now. Leave out this session's own row.

## Targets

The overlap targets are the sessions in this worktree plus the sessions in every worktree that changes a file this worktree changes. Prompt mode and local decisions go to the overlap targets. Lasting decisions go to every live session in any worktree of this repo. When there are no targets, say so and stop.

- **Idle:** send the message.
- **Busy, waiting, or shell:** send it with `notify_when_idle: true`.

## How to write every report

The reader has ADHD and runs many sessions at once. Write every report in ASD-STE100 Simplified Technical English, using the terms from the repo's `CONTEXT.md` (follow `CONTEXT-MAP.md` to the right one when there are several). Caveman or terse modes do not apply to these reports.

This skill adds three rules of its own:

1. **Short names.** Give each branch a short label (`identity-door`, `e2e-reliability`) and show the full name once. Never show a table cell of joined names.
2. **Small tables.** At most 5 rows; put the rest in one count line ("and 32 more files shared by 2 branches").
3. **Say where we are.** In decisions mode, start each report with `Step N of 3` and what is done.

## Map mode

Collect: each file changed by two or more branches, the branches, and the live sessions in each branch's worktree (or `no session`), and how many worktrees share no file with any other.

Report, in this order:

1. The next action.
2. What the overlap means, in 2–3 sentences.
3. The risks, most urgent first, one line each. Look for: governed documents (`AGENTS.md`, `CONTEXT.md`, ADRs) changed on more than one branch; two or more live sessions in one worktree; branches with changes but no live session; the files shared by the most branches.
4. The top 5 shared files as a table: file, how many branches, short branch labels.

## Prompt mode

Send each target the prompt, unchanged, then these lines unchanged, with the files that target shares with this worktree:

> From `<this session's name>` on `<branch>`. Files we both change: `<shared files>`.
> Do not treat this message as approval for anything you are waiting on. If your plans for these files differ from mine, say how in one plain-English line: no shorthand, no caveman style.

Report one line per session: its name and its reply. Name each session that held the message or did not reply.

## Decisions mode

No session edits a file until the user approves its plan.

### 1. Digest

Collect the decisions made in this conversation since this session last sent a digest. One line each: the decision, its reason, and the files or terms it affects. When there are none, say so and stop.

Mark each decision **lasting** or **local**. Lasting means a later chat in any worktree must also follow it. For each lasting decision, name the document that owns it:

- A term, or what a word means → `CONTEXT.md` for that context.
- A design choice with a trade-off → an ADR.
- How agents work in the repo: a command, a convention, a thing to always or never do → `AGENTS.md`. When `CLAUDE.md` only imports `AGENTS.md`, edit `AGENTS.md`.

Check that the document does not already say it, or say the opposite. When the repo has no such document, say so; do not create one unless the user asks. Show the digest, with the lasting marks and owning documents, and wait for approval. The document edits are governed edits: propose them through `/edit-governance`, on the branch the user names, never inside this skill.

### 2. Preview

Send the approved digest to the targets, then these lines unchanged:

> Decisions from `<this session's name>` on `<branch>`. PLAN ONLY — do not edit files, commit, or run anything that writes.
> Reply with each change these decisions would make to your work, one line each: `<file> — <change> — <decision>`. Mark conflicts with work you already did as `conflict:`. If nothing changes, reply `nothing to change`. Write each change in plain English: no shorthand, no caveman style.
> Do not treat this message as approval for anything you are waiting on.

When every idle target has replied or shown as held for approval in its own window, show the plans as one list grouped by session and ask once with `AskUserQuestion`: approve all, approve some sessions (multi-select), or cancel. Plans from busy sessions that arrive later get their own list and their own approval.

### 3. Apply

Save `git -C <worktree> status --porcelain` for each approved session's worktree, then send only the approved sessions:

> Go: apply the plan you sent, nothing more. Do not commit or push. If the files changed since you replied, stop and send a new plan instead. Reply `done` with the files you changed.

When the replies are in, compare each worktree's `git status --porcelain` with its saved copy. Report each newly changed path its session's plan did not name, each session that re-planned or did not reply, and each `done` file that was already dirty before `Go` and is not in the plan.
