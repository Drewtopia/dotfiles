# Changelog

Notable changes, newest first. Generated from Conventional Commits by git-cliff.

<!-- git-cliff: end of header -->

## 0.1.0 - 2026-09-14

**Track the 1Password beta channel instead of nightly on macOS.**

- `home/.chezmoiscripts/darwin/run_onchange_before_10-install-brew-packages.sh.tmpl` now lists the `1password@beta` cask in place of `1password@nightly`.
- Both casks install the same artifact to `/Applications/1Password.app`, so a machine that still has the nightly cask will hit an app collision when `brew bundle` runs. The script uses `set -eufo pipefail`, so that collision aborts the rest of it — the Mac App Store installs and the Quick Look quarantine strip never run. Uninstall the nightly cask first on any such machine: `brew uninstall --cask 1password@nightly`.
- Both channels ship under Team ID `2BUA8C4S2C`, so the SSH agent socket path in `dot_zshenv.tmpl` and `dot_ssh/config.tmpl` is unaffected.

**Split mattpocock/skills by agent: `npx skills` everywhere except Claude Code.**

- `.chezmoidata/skills.yaml` entries take an optional `agents:` list, rendered as `skills add --agent`. Omitting it keeps the previous behaviour (install to every detected agent).
- mattpocock/skills is now two entries: the whole repo (`"*"`) for Codex, Cursor and GitHub Copilot, which previously got none of the stable engineering/ and productivity/ skills; and the nine misc/ and in-progress/ skills for Claude Code, which takes the rest from the `mattpocock-skills@mattpocock` plugin. The `"*"` also retires the hand-maintained name list that went stale on every upstream rename.
- `.chezmoiremove.tmpl` no longer deletes the `~/.agents/skills` payload for plugin-covered skills — that store is what the non-Claude agents read. It still sweeps the `~/.claude/skills` symlinks so they can't shadow the plugin's namespaced versions.

### Features

- **skills:** Add mattpocock implement skill
- **hooks:** Warn when reading derived artifacts
- **wsl:** Shim op to the Windows op.exe
- **claude:** Manage audit-skill-repos skill
- **macrowhisper:** Manage config via chezmoi
- **brew:** Install Mac App Store apps via mas
- **superwhisper:** Point the CLI at the managed settings path
- **claude:** Default to auto permission mode
- **claude:** Reinstate the context7 plugin
- **shell:** Export CONTEXT7_API_KEY and drop the vault branches
- Add open-brain skill split from /close
- **tmux:** Relaunch claude sessions on resurrect restore
- **worktrunk:** Create a tmux session per worktree
- **skills:** Portable housekeeping suite (find-session, clean-workspace, reconcile-tracker)
- **claude:** Convergence collision hooks (edit-time + wt pre-start)
- **hooks:** Live cross-session collision registry with presence and retention
- **atuin:** Enable daemon, ai, and daemon-fuzzy search mode
- **herdr:** Manage herdr via mise and chezmoi
- **tmux:** Report focus events to inner apps
- **claude:** Name tmux window per Claude Code session
- **claude:** Window name cc:<dir>·<id4> via session-start hook
- **claude:** Worktree-aware CwdChanged advisory hook
- **claude:** Observability hooks -- denial audit, API-failure log, pre-compact snapshot
- **agents:** Rewrite global CLAUDE.md — machine-templated environment, flag-don't-force guardrails
- **skills:** Add homelab-ops — absorbs booklore/lxc-rollback/running-services vault rules
- **worktrunk:** Add delta picker pager and universal copy-ignored excludes
- **claude:** Name tmux window by git branch in worktrees
- **ssh:** Track hosts by .home name, keep usernames out of git
- **bin:** Add claude-ls to list Claude Code sessions with ids
- **bin:** Add claude-triage to surface sessions with unfinished work
- **bin:** Windows .cmd wrappers for claude-ls and claude-triage
- **skills:** Add shared closer reference, paged PR set, session-log helper
- **worktrees:** Copy guidance files into secondary worktrees
- **skills:** Scope skill installs per agent, split mattpocock by agent
- **skills:** Add whats-next to pick the next session to return to
- **skills:** Reconcile sessions and reach out to them for status
- **claude:** Add review-open-prs command for periodic PR sweeps
- **claude:** Add catch-up, a re-entry briefing for one repo
- **worktrunk:** Show CI and summary columns on every wt list
- **claude:** Add scope-drift check hook on UserPromptSubmit
- **claude:** Register the superpowers onboarding drift check on SessionStart
- **skills:** Install the orca computer-use skill
- **claude:** Manage tui, theme and worktree defaults
- **claude:** Regenerate session board and log unclosed sessions on session end
- **ccstatusline:** Add session-board triage widget to line 1

### Fixes

- **cvault:** Refuse to commit through a failed autostash
- **deps:** Bump nested js-yaml to 3.15.0
- **claude:** Align close skill with memory model and hooks
- **chezmoi:** Ignore junction-based skills on personal Windows
- **claude:** Use Edit() deny rules for .env files
- **ssh:** Route github over port 443 on all platforms
- **claude:** Prune retired deny rules from merged settings
- **wsl:** Cap WSL2 resources on work hosts
- **deps:** Bump js-yaml to patch the omap DoS advisory
- **git:** Pin personal identity as global default, scope work identity to Azure
- **tmux:** Resolve keybinding conflicts in reset.conf
- **claude:** Drop discarded lint/typecheck from stop hook
- **hooks:** Skip notify.js desktop popup under Ghostty
- **claude-triage:** Shorten Windows backslash paths in output
- **skills:** Parse merged-prs link from branch, not title
- **skills:** Drop only the bare 5-digit ADO fallback from title parsing
- **atuin:** Disable the daemon
- **worktrunk:** Strip dots from tmux session names
- **worktrees:** Symlink hook scripts into secondary worktrees
- **git:** Verify SSH commit signatures with an allowed-signers file
- **git:** Trust the personal signing key too, without committing it
- **skills:** Source the zod skill from a repo that actually ships it
- **claude:** Replace quadratic whitespace check in settings merge ([\#106](https://github.com/Drewtopia/dotfiles/pull/106))
- **claude:** Only flag undeclared governance edits in PR sweeps
- **claude:** Prune closed PRs from the review state file
- **claude:** Re-review a PR when it moves between draft and ready
- **claude:** Install humanizer as plugin, not vendored skill
- **skills:** Keep humanizer installed for the non-Claude agents
- **brew:** Move the 1Password cask from the nightly to the beta channel
- **hooks:** Resolve the commit's own repo, not the session's cwd
- **shell:** Export the vault PAT as MISE_GITHUB_TOKEN
- **claude:** Resolve commit gate against the target repo, not the session cwd
- **shell:** Export GITHUB_TOKEN for chezmoi's GitHub template functions
- **git:** Normalise allowedSignersFile to forward slashes
- **claude:** Drop the stale scoop PATH line from the settings merge
- **claude:** Sync settings.json on Windows via a run_onchange script
- **mise:** Install tokei via cargo
- **worktrunk:** Stop worktree hooks multiplying claude sessions
- **worktrunk:** Skip tmux claude session when Orca runs the hooks
- **git:** Let gh alone answer GitHub HTTPS logins

### Refactoring

- **skills:** Budget audit-rules-and-skills by resident cost
- **git:** Source personal identity from chezmoi data, not a literal
- **skills:** Close + reorganize-memory drop the dead auto-memory system — vault is the only memory destination
- **ssh:** Rename mac alias to drew-mbp
- **ssh:** Use homeassistant.home instead of .local
- **ssh:** Collapse work-eth/work-wifi into one 'work' alias
- **skills:** Route close and reconcile-tracker through the shared closer
- **skills:** Clean-workspace owns worktree removal, add self-check
- **worktrees:** Drop the rules top-up, keep the hooks symlink
- **claude:** Drive PR sweeps with code-review plus toolkit escalation
- **shell:** Define core env vars once, in .zshenv
- **git:** Use chezmoi's pathSeparator instead of a literal backslash
- **claude:** Extract the settings merge into a shared template

### Documentation

- **claude:** Refresh memory topic list in CLAUDE.md
- **scripts:** Correct how Claude marketplaces actually get refreshed
- Rework /close skill - drop open brain, fix memory guidance, add post-merge cleanup
- **agents:** Relocate chezmoi working knowledge from global agent memory
- **skills:** Audit-rules-and-skills exemplars — comment-discipline replaces renamed keep-comments; refresh line counts
- **agents:** Chezmoi-quirks — drop dead chezmoi-config section and jj-hooks claim, fix mise run_onchange fact, complete four-file surface, dedupe
- **skills:** Note that a plugin move sweeps only the Claude symlink
- **shell:** Drop the per-variable list from the .zshenv signpost
- Track the mistakes log and three research notes
- **skills:** Correct why zod comes from anivar/zod-skill

### Reverts

- **ssh:** Keep homeassistant.local (HA mDNS default)

### Maintenance

- **brew:** Drop logi-options+ from cask auto-install
- **skills:** Also purge orphaned .agents/skills payloads
- **skills:** Track 9 new mattpocock skills
- **skills:** Track mattpocock claude-handoff skill
- **commit-check:** Allow agent/ branch prefix
- **skills:** Track microsoftdocs azure-repos skill
- **dotfiles:** Refresh drifted source from work machine
- **shell:** Add kanata launchctl control functions
- **skills:** Reconcile mattpocock set to v1.1.0
- **topgrade:** Drop -y from skills update so lock orphans self-clean
- **topgrade:** Adopt native skills step from 17.7.0
- **brew:** Remove selected macOS casks
- **brew:** Drop lunar cask, restore home-assistant
- **brew:** Drop raycast cask in favour of Raycast Beta
- **brew:** Drop elgato-stream-deck cask
- **macrowhisper:** Watch ~/superwhisper per 2.16.4 default folder
- **claude:** Consolidate skill plugins onto mattpocock-skills
- **claude:** Manage the i-have-adhd plugin via chezmoi
- **claude:** Retire eight unused plugins
- **skills:** Reconcile mattpocock/skills against upstream
- **macrowhisper:** Adopt the clipboardStacking key the app now writes
- **skills:** Sweep wait-what alongside the rest of mattpocock's plugin
- **claude:** Stop pinning cleanupPeriodDays
- **worktrunk:** Pin list json-schema to 2
- **git:** Ignore mise per-machine overrides and more agent tooling
- **claude:** Wire new event hooks into settings, pin notifChannel to auto
- **agents:** Drop retired ECC env vars and superseded warn-edit-on-protected hook from settings floor
- **claude:** Pin autoMemoryEnabled=false across all machines
- **claude:** Reinstate superpowers-extended-cc and code-simplifier — toml said retired, both in active use
- **claude:** Retire output-style plugins — superseded by the native outputStyle setting
- **claude:** Register pr-review-toolkit in the plugin manifest (in active use)
- **claude:** Retire the stop-end-of-turn hook
- **claude:** Drop Stop registration and tombstone the retired hook
- **chezmoi:** Prune dead ignore entries, gate btop off Windows
- **skills:** Writing-for-agents sweep — drop rotting counts and dead hook pointer, unhardcode governed-skill list, cleanupPeriodDays is a CC default
- **skills:** Delete the housekeeping router
- **settings:** Migrate off the deprecated includeCoAuthoredBy key
- **skills:** Restore housekeeping as a lean router
- Retire claude-brain-sync plugin
- Keep the mistakes log local, drop an absolute path from the research note
- **ccstatusline:** Track the v4 settings schema, drop the tmpl suffix
- **mise:** Move eza, tokei and pay-respects to preferred backends
- Replace changesets with git-cliff for the changelog
- **changelog:** Harden the git-cliff release flow

### Other

- Per-invocation unlock markers, --lock, cwd-repo registry check

## 0.0.1

### Patch Changes

- [#21](https://github.com/Drewtopia/dotfiles/pull/21) [`658801d`](https://github.com/Drewtopia/dotfiles/commit/658801d683d206616f915fdf197f0630d95d7c42) Thanks [@Drewtopia](https://github.com/Drewtopia)! - Reconcile mattpocock/skills to upstream v1.0.0 and adopt changesets.

  - Skills: replace `write-a-skill` → `writing-great-skills`, rename `diagnose` → `diagnosing-bugs`, drop `zoom-out`; add `codebase-design`, `domain-modeling`, `resolving-merge-conflicts`, `ask-matt`, `grilling`. Stale `~/.claude/skills` symlinks purged via `.chezmoiremove.tmpl`.
  - Tooling: adopt `@changesets/cli` for a versioned `CHANGELOG.md` (local-only, nothing published).
