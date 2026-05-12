# github.com/Drewtopia/dotfiles

Drew's dotfiles, managed with [`chezmoi`](https://github.com/twpayne/chezmoi).

## Fresh-machine bootstrap

    sh -c "$(curl -fsSL https://github.com/Drewtopia/dotfiles/raw/main/install.sh)"

That's it. The bootstrapper installs `chezmoi` if missing, then runs
`chezmoi init --apply`. The rest is handled by chezmoi scripts:

- `run_onchange_before_00-install-mise` (Mac, Linux) — installs `mise`
- `run_onchange_before_20-install-1password` (Mac, Linux) — installs `op`
- `run_*_after_*` scripts — mise tools, pnpm globals, Claude Code,
  plugin marketplaces, agent skills

### What you'll be prompted for on first init

- **Name + email**: if `op` is already installed, identity is fetched
  from your 1Password vault automatically. If not, you'll type/paste
  once — stored locally in `~/.config/chezmoi/chezmoi.toml` (never
  committed to git).
- **Dev folder** (Windows only): if work-machine, a top-level folder
  name for relocated dev tools.

### Sign in to 1Password (after install)

For secrets used in `.zshrc`, SSH keys, etc., sign in with:

    eval $(op signin)

Or enable the desktop-app integration in 1Password settings (Touch ID
on macOS, Windows Hello on Windows).

### Already-set-up machine

    chezmoi update      # pull + apply latest from origin/main
    chezmoi apply       # re-apply current source state