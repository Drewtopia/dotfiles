---
description: Sync the Claude memory vault (pull + push)
---

Run `cvault sync` and show the output verbatim.

What it does:
- `cvault update` — `git pull --rebase --autostash` from origin in `~/.claude-vault/`
- `cvault apply` — if working tree has changes, `git add -A && commit && push`

If you see `cvault: no local changes to apply` and an "Updated" line, sync is complete and there was nothing local to push. If you see "Applied", local changes were just committed and pushed.

If `cvault` isn't found, ensure `~/.local/bin/` is on PATH and `chezmoi apply` has run on this machine.
