# github.com/Drewtopia/dotfiles

Drew's dotfiles, managed with [`chezmoi`](https://github.com/twpayne/chezmoi).

## Fresh-machine bootstrap

**macOS / Linux / WSL:**

    sh -c "$(curl -fsSL https://github.com/Drewtopia/dotfiles/raw/main/install.sh)"

**Windows (PowerShell):**

    irm https://github.com/Drewtopia/dotfiles/raw/main/install.ps1 | iex

Either bootstrapper installs `chezmoi` if missing, then runs
`chezmoi init --apply drewtopia`. The rest is handled by chezmoi scripts:

- `run_onchange_before_00-install-mise` (Mac, Linux) — installs `mise`
- `run_onchange_before_20-install-1password` (Linux) — installs `op`; macOS
  gets it from the `1password-cli` Homebrew cask
- `run_onchange_before_10-install-scoop` (Windows) — installs scoop, then
  mise + 1password-cli + other packages declared in `.chezmoidata/scoop.toml`
- `run_*_after_*` scripts (all OSes) — mise tools, pnpm globals, Claude
  Code, plugin marketplaces, agent skills

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

## Releases and changelog

`CHANGELOG.md` is generated from Conventional Commits by git-cliff (`cliff.toml`).
Releases are `v*` tags on `main`; unreleased commits are everything since the last tag.

    git cliff --bumped-version                      # preview the next version
    git cliff --unreleased                          # preview the next section
    v=$(git cliff --bumped-version)
    git cliff --unreleased --bump --prepend CHANGELOG.md \
      --with-tag-message "$(cat notes.md)"          # optional release notes, rendered under the heading
    git commit -am "chore(release): $v"             # skipped by the changelog parsers
    git tag -a "$v" -F notes.md                     # same notes, or -m "$v" when there are none
    git push origin main "$v"

Always prepend; never regenerate the whole file. The 0.0.1 entry predates git-cliff and
cannot be rebuilt from history. Storing release notes in the annotated tag keeps them
reproducible. When the release commit carries real changes instead of `chore(release)`,
pass its message with `--with-commit` so it lands in the section it ships in.

Set `GITHUB_TOKEN` to add PR links. `cliff.toml` is a copy of the shared house style in
`home/dot_config/git-cliff/templates/drew.toml`; start another repo with `git cliff --init drew`.