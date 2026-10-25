# ADR-0001: Agent memory and rules live in a separate vault repo

Status: accepted, 2026-04-27

## Context

Claude Code reads agent memory from `~/.claude/memory` and rules from `~/.claude/rules`. That content changes daily, is written by agents during sessions, and is private. The dotfiles repo changes far less often, and every commit to it goes through chezmoi's source state. Cloning the vault straight into `~/.claude/memory` also breaks, because the vault repo's top level already contains `memory/`, which produces a nested `memory/memory/` layout.

## Decision

- The vault is its own private repo, `Drewtopia/claude-vault`, cloned to `~/.claude-vault/` as a `git-repo` external in `home/.chezmoiexternal.toml.tmpl` (shallow clone, weekly `--ff-only` pull).
- The clone happens on personal machines and on work machines that are not Windows. Work Windows does not run Claude Code, and chezmoi manages nothing under `~/.claude` there (`home/.chezmoiignore.tmpl`).
- chezmoi links the vault into `~/.claude` with `symlink_` entries: `home/dot_claude/symlink_memory.tmpl` and `home/dot_claude/symlink_rules.tmpl`.
- On Mac and Linux both links are managed. On personal Windows only `.claude/rules` is un-ignored, and that symlink needs Developer Mode.
- A pre-apply script moves any real `~/.claude/memory` directory aside to a timestamped `.bak` so it doesn't block the symlink (`home/.chezmoiscripts/common/run_before_03-backup-claude-memory.{sh,ps1.tmpl}`).
- `cvault` (`home/dot_local/bin/executable_cvault`) is the git front end for the vault.

## Consequences

- Memory commits never touch the dotfiles history, and the dotfiles repo can go public without exposing memory.
- There are two repos to sync. chezmoi only pulls fast-forward, so local vault commits that diverge from origin show up as fetch failures and need manual reconciling (`cvault`, the `vault-sync` skill).
- A machine without the SSH key for the private repo fails that external during apply.
- Windows gets less than Unix: `.claude/memory` is not linked there, rules depend on Developer Mode, and work Windows gets nothing.
- Anything that writes into `~/.claude/memory` is writing into the vault working tree, not into chezmoi's source.
