---
name: clean-workspace
description: Fast local declutter — prune merged worktrees, clear finished Agent View cards, report the stale-session tail.
disable-model-invocation: true
---

# Clean workspace

Deterministic local cleanup — no agents, runs in seconds. Prune merged git worktrees, clear finished
Agent View cards, report the stale Claude-session tail. Run whenever the machine feels cluttered.

## Done set

Source the shared helper for the merged/gone branch set (excludes HEAD + trunk):
`bash ~/.claude/skills/_lib/merged-set.sh` → `<branch>\t<linked-id>` per line. Trunk is
auto-detected (`origin/HEAD`, else develop/main/master); override with `TRUNK=<branch>`.

## Steps

1. **Worktrees** — if `wt` (worktrunk) is installed: `wt step prune --dry-run`, review, then
   `wt step prune`. Removes worktrees + branches already integrated into the trunk; merge-gated
   (skips dirty/unintegrated trees).
   **No `wt`** (`command -v wt` fails) — fall back to plain git, gated by the done set above: for
   each `<branch>` the helper returns, find its path in `git worktree list`, then
   `git worktree remove <path>` (no `--force` — a dirty tree should refuse) and `git branch -d
   <branch>`. Never touch a branch the helper didn't return.
2. **Agent View** — `claude agents --json --all` (or read `~/.claude/jobs/<id>/state.json`). Cards
   with `state: done` are candidates. **Confirm before removing** — done means the job finished, not
   that you are finished with it; a card can be "done, awaiting you," which only the user judges. For
   each approved card: `claude rm <id>` — keeps the transcript resumable, and refuses any card whose
   worktree has unpushed commits (surface those as a warning: push or force-remove; never force).
   Never a running card (cross-check `daemon/roster.json`). On each successful removal, append
   `{id,title,branch,removedAt}` to `~/.claude/housekeeping/removed-log.jsonl` so
   `/find-session --removed` can recover it.
3. **Rename unnamed sessions** — auto-titles (`automatedtesting-f3`) are unscannable in the resume
   picker. `python3 ~/.claude/skills/clean-workspace/rename-sessions.py` (dry-run) shows proposed
   branch-derived names for every dead, never-renamed session on a real feature branch; re-run with
   `--apply` to write (backs up `~/.claude/sessions/` first). Live sessions and already-named ones are
   left alone. The custom name lives in `~/.claude/sessions/<pid>.json` (`name`, no `nameSource`) — a
   dead-pid file is safe to edit; a live one is not. Going forward, `/rename <name>` or `Ctrl+R` in
   the picker names a session by hand.
4. **Stale session tail** — report the count of transcripts older than `cleanupPeriodDays`
   (settings.json). **Do not delete transcript files** — the native startup sweep expires them (and
   orphaned worktrees) safely; moving a running session's `.jsonl` strands it. Report only. See
   [SESSIONS.md](SESSIONS.md) for enumerating and classifying sessions.
