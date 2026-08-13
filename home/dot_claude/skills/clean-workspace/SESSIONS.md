# Sessions job

Read-only. Find Claude sessions whose work is finished, so they can be cleared from the Agents
picker. **Proposal-only — never move or delete a session file.** Return findings; the user clears.

## Enumerate

- Glob `~/.claude/projects/*<token>*/*.jsonl`, where `<token>` is the current project — the last
  path segment of the repo root, or the parent project if cwd is under `.claude/worktrees/` (same
  derivation `find-session.py` uses). One file per session, name = session UUID. No index/db exists;
  globbing is the only list. Pass `--all`-style intent by dropping the token to sweep every project.
- Per session, cheaply read:
  - `gitBranch` + last `timestamp` — `tail` the file for the last record carrying them.
    **Use the in-file `timestamp`, not file mtime** — a large pre-2026-06-04 block was bulk-touched,
    so mtime lies for those.
  - `ai-title` header record — the only human-readable label (no custom title exists).

## Live set — compute ONCE, before classifying

Build the running-sessionId set up front and hold it. Deriving it inside the per-session loop is
where a run trips on a reused loop variable — compute it once, in one pass, no shell `for`:

```sh
python3 - <<'EOF'
import json, glob, os
for path in glob.glob(os.path.expanduser('~/.claude/sessions/*.json')):
    try:
        d = json.load(open(path))
    except Exception:
        continue
    if d.get('status') in ('busy', 'running') and d.get('sessionId'):
        print(d['sessionId'])
EOF
```

Add the **currently-running session's own id** to that set too.

## Classify each session

- **live** — its `sessionId` is in the live set (above). **Live sessions are never proposed**,
  whatever their branch or age — the user may be mid-work. Check this first.
- **done** — not live, AND its `gitBranch` is in the merged set (gone-from-remote, or
  merged-and-not-HEAD/trunk per the skill's merged-set rule). Work is integrated. Link its
  `GH-N` (parse the branch name).
- **stale** — not live, not done, last activity > 30 days.

## Return

A table: `sessionId | ai-title | branch | state | GH-N | proposed action`. Sort done-first.

**This job reports; it does not delete transcript files.** The stale tail is cleared natively by
`cleanupPeriodDays` (settings.json, 30) — its startup sweep expires aged transcripts and orphaned
worktrees. Report the stale count so the pile is visible, but leave the deletion to the native
sweep; moving/deleting a running session's `.jsonl` strands it. Agent View cards are a separate
surface, cleared with `claude rm <id>` (see the skill's inline Agent View job) — not this job.
