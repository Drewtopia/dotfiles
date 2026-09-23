# chezmoi quirks (Reference)

Working knowledge for agents editing this repo.

## Edit the source, not `chezmoi add`

The generated config sets `[git] autoCommit = true` with a `promptString` commit message. Any source-changing command (`add`, `re-add`, ...) then waits on a prompt a non-TTY caller cannot see, and commits the whole working tree.

- Write straight to the source path under `home/` and commit with git.
- Use `chezmoi add` only when you need its attribute or `--autotemplate` handling, and commit or set aside unrelated work first.
- Check with `chezmoi managed | grep <name>` and `chezmoi diff <live-path>` (empty diff means source matches live).

## Path mapping

- `~/.config/foo/bar` is `home/dot_config/foo/bar`, with `.tmpl` only when the file uses template syntax.
- `dot_` replaces a leading dot. `private_`, `executable_`, `symlink_`, `modify_`, `exact_` and `empty_` set attributes.
- chezmoi owns the mise config (`home/dot_config/mise/config.toml.tmpl`), so `mise use -g` edits are overwritten on the next apply. Add tools in the template.
- `.chezmoiignore.tmpl` decides which targets apply per OS and flag. A new file that should not land everywhere needs an entry there.

## Machine flags

Set in `home/.chezmoi.toml.tmpl`:

- `ephemeral`: no secrets, fonts or dev tools.
- `personal` / `work`: known personal hostnames skip the prompt; elsewhere the prompt decides. `opVault` is `Private` or `Employee` to match.
- `dev_computer`: gates mise tools and editor settings.
- `is_wsl`: `.bashrc`, the `op.exe` shim at `~/.local/bin/op`, Windows programs by `/mnt/c` path.
- `relocated`: only on work Windows; dev tools live under a whitelisted `tools_root` instead of `$HOME`.
- `osid`: `linux-ubuntu` and similar, for apt and Linux-only externals.

## Agent vault

- `~/.claude-vault` is a git-repo external (`Drewtopia/claude-vault`), cloned on personal machines and work non-Windows machines, pulled weekly with `--ff-only`.
- Mac and Linux: `~/.claude/memory` and `~/.claude/rules` are symlinks into it (`home/dot_claude/symlink_memory.tmpl`, `symlink_rules.tmpl`).
- Personal Windows manages only the `rules` symlink, which needs Developer Mode. Work Windows manages nothing under `~/.claude`.

## Scripts

- `.chezmoiignore.tmpl` drops `.ps1` scripts on Unix and `.sh` scripts on Windows.
- mise install scripts are `run_onchange_after` with the mise config hash in a header comment, so they rerun when the tool set changes. topgrade handles upgrades, including `tv update-channels`.
- Windows runs `.ps1` scripts with `powershell.exe` 5.1 so a stock machine can bootstrap. Scripts must stay 5.1-compatible; the pwsh-dependent ones relaunch themselves in pwsh 7 when it exists.
- Windows order: `00-install-powershell` (winget pwsh 7), `00-install-mise`, `05-set-env-vars`, `06-bootstrap-work`, `08-install-winget-pkgs` (includes the 1Password CLI), `10-install-scoop`. Package lists for winget and scoop live in `home/.chezmoidata/`.
- Use `bun x`, not `bunx`, on Windows.
- `chezmoi update` runs `git pull`, so keep the source repo on plain git with a checked-out branch (jj's colocated detached HEAD breaks it).

## Shell

- zsh loads `.zshenv`, then `.zshrc`, which sources `~/.config/shell-loader.sh`; that sources `~/.config/shell/*.sh` in name order (`000-paths`, `010-mise`, `015-vault`, `020-shell-tools`, ...).
- carapace and `fzf --zsh` init live in `020-shell-tools.sh`, after mise activates, because they need mise's tools on PATH.
- Machine-only overrides go in `~/.zshenv.local` and `~/.zshrc.local`, which chezmoi does not manage.
- `HOMEBREW_FORBIDDEN_FORMULAE` in `.zshenv` blocks formulae that moved to mise. After `brew uninstall X`, add `X` to it.

## Themes

Everything uses Catppuccin Mocha: bat via `--theme`, television and tmux through their own config and plugin, eza, yazi and btop through theme-file externals in `.chezmoiexternal.toml.tmpl`, and fzf-based tools (navi) through `FZF_DEFAULT_OPTS` in `020-shell-tools.sh`. For a new tool, find its Catppuccin theme and follow the same pattern.
