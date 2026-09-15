Reference — package sources and machine tiers

# Package sources and machine tiers

## Machine tiers

| Tier | Machines | What applies |
|------|----------|--------------|
| Full | macOS, Windows 11, WSL2 Ubuntu | Everything: OS base, dev tools, secrets, GUI apps where the OS has them |
| Minimal | Proxmox VE hosts, Debian and Ubuntu LXC containers | OS base packages and shell config only: no dev tools, no secrets |
| Unsupported | Anything else | May work, no promises |

The minimal tier is the `ephemeral` data flag. `home/.chezmoi.toml.tmpl` sets
it for containers and cloud environments (`CODESPACES`, `REMOTE_CONTAINERS_IPC`),
for the usernames `root`, `ubuntu`, `vagrant` and `vscode`, and when the init
prompt is answered yes. Dev tools additionally require `dev_computer`, which is
only asked on non-ephemeral machines.

The Linux install scripts run only on Debian-family systems (`osid` of
`linux-debian`, `linux-ubuntu` or `linux-raspbian`), targeting Debian 12+ and
Ubuntu 22.04+.

## Tool-source rule

| Source | Used for | Where |
|--------|----------|-------|
| apt (Linux), Homebrew (macOS), winget and scoop (Windows) | The OS base: shells, git, tmux, system libraries, GUI apps, fonts on Windows | `linux/run_onchange_before_10-install-apt-packages`, `darwin/run_onchange_before_10-install-brew-packages`, `windows/run_onchange_before_08-install-winget-pkgs`, `.chezmoidata/scoop.toml` |
| mise | Dev CLIs and language runtimes, dev machines only | `dot_config/mise/config.toml.tmpl` |
| Direct download | Only what neither covers | `.chezmoiexternal.toml.tmpl` (fonts, `cue` on Ubuntu) |

A tool lives in exactly one source per OS. When a dev CLI is available from
both the OS package manager and mise, mise wins; `HOMEBREW_FORBIDDEN_FORMULAE`
in `dot_zshenv.tmpl` stops Homebrew reinstalling tools mise owns.

## 1Password CLI

| Platform | Source |
|----------|--------|
| macOS | `1password-cli` Homebrew cask |
| Linux (non-WSL, non-ephemeral) | 1Password's apt repository, added by `linux/run_onchange_before_20-install-1password` |
| WSL | No Linux package. `~/.local/bin/op` is a shim that runs the Windows `op.exe`, because the Linux CLI cannot reach 1Password for Windows. `linux/run_onchange_before_20-install-op-wsl-shim` writes it from `.chezmoitemplates/op-wsl-shim` before any template renders |
| Minimal tier | Not installed |
