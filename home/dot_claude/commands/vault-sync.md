---
description: Sync the Claude memory vault (pull + push)
---

Run `$HOME/.local/bin/cvault sync` and show the output verbatim.

(Absolute path so PATH config isn't required — important on Windows Git Bash where `~/.local/bin/` may not be on PATH for non-interactive shells.)

What it does:
- `cvault update` — `git pull --rebase --autostash` from origin in the vault dir
- `cvault apply` — if working tree has changes, `git add -A && commit && push`

If you see `cvault: no local changes to apply` and an "Updated" line, sync is complete and there was nothing local to push. If you see "Applied", local changes were just committed and pushed.

If the binary isn't found at `$HOME/.local/bin/cvault`, run `chezmoi apply` to install it.
