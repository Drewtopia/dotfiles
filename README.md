# github.com/Drewtopia/dotfiles

Drew's dotfiles, managed with [`chezmoi`](https://github.com/twpayne/chezmoi).

## Fresh-machine bootstrap

### 1. Install the 1Password CLI

`chezmoi.toml.tmpl` calls `onepasswordRead` at init time, so `op` must be
present AND signed in **before** running `chezmoi init`.

| OS      | Install                                                                  |
|---------|--------------------------------------------------------------------------|
| macOS   | `brew install 1password-cli`                                             |
| Linux   | [docs](https://developer.1password.com/docs/cli/get-started/)            |
| Windows | `scoop install 1password-cli`                                            |

Then sign in (or enable the desktop-app integration in 1Password settings):

    eval $(op signin)

### 2. Run the bootstrapper

    sh -c "$(curl -fsSL https://github.com/Drewtopia/dotfiles/raw/main/install.sh)"

This verifies the prereqs, installs `chezmoi` if missing, and runs
`chezmoi init --apply`. The rest of the toolchain (`mise`, language
runtimes, Claude Code, agent skills, plugin marketplaces) is installed
by chezmoi's `run_*_before` and `run_*_after` scripts during apply.

### Already-set-up machine

    chezmoi update      # pull + apply latest from origin/main
    chezmoi apply       # re-apply current source state