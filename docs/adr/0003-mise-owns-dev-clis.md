# ADR-0003: mise owns dev CLIs; OS package managers own only the OS base

Status: accepted, 2026-03-25

## Context

The same CLI tools (bat, ripgrep, fd, delta, lazygit, fzf, zoxide and others) used to be installed a different way on each OS: Homebrew, scoop or winget, apt, plus binaries downloaded as chezmoi externals. Each tool was listed in up to five places, and versions drifted between machines.

## Decision

- Dev CLIs and language runtimes come from mise, declared once in `home/dot_config/mise/config.toml.tmpl`. The whole file is gated on `dev_computer`.
- Backend preference is `aqua:` (checksum-verified, has Windows support), then `github:`. `cargo:` is used only when a tool publishes no prebuilt binary for that OS: `eza` and `navi` on macOS, `tokei` outside Windows. `vfox` and `asdf` are not used for new tools.
- The OS package managers install only the OS base: shells, git, tmux, system libraries, GUI apps and fonts. These live in `darwin/run_onchange_before_10-install-brew-packages.sh.tmpl`, `linux/run_onchange_before_10-install-apt-packages.sh.tmpl`, `.chezmoidata/winget.toml` and `.chezmoidata/scoop.toml`.
- chezmoi externals download only what neither source covers: fonts, shell and tmux plugins, theme files, and `cue` on Ubuntu.
- `HOMEBREW_FORBIDDEN_FORMULAE` in `home/dot_zshenv.tmpl` blocks Homebrew from reinstalling any formula mise owns.
- `common/run_onchange_after_10-install-mise-tools.{sh,ps1}.tmpl` re-runs `mise install` whenever the config's hash changes. topgrade handles routine upgrades.

The current per-source lists are in `docs/reference/package-sources.md`.

## Consequences

- There is one tool list for all three OSes, with per-OS exceptions written as template conditionals in the same file.
- mise has to be bootstrapped before any after-script can use these tools (`run_onchange_before_00-install-mise.*`: Homebrew or mise.run on Unix, winget on Windows).
- Machines without `dev_computer` get none of these CLIs, only the OS base.
- Tools are pinned to `latest` with no lockfile, so machines agree only as of their last install or upgrade.
- A GitHub rate limit or a missing aqua binary can fail single tools. The install script reports those tools and lets the apply continue, which means a machine can end up partly provisioned.
- Adding a tool to Homebrew for convenience silently conflicts with mise unless it also goes on the forbidden list.
