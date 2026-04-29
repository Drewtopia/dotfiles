# External Integrations

**Analysis Date:** 2026-04-29

## APIs & External Services

**GitHub:**
- Service: GitHub API for repository management and SSH key operations
- SDK/Client: `gh` CLI (installed via mise, `aqua:cli/cli`)
- Auth: GitHub Personal Access Token via `gh auth` credential helper
- Usage: Configured in `home/dot_config/git/config.tmpl` for git credential + gist access
- Reference: `gh auth git-credential` for HTTPS operations; SSH via `git@github.com:Drewtopia/` when personal machine

**1Password:**
- Service: 1Password password vault and SSH agent
- Auth: 1Password account (machine biometric or password required)
- Usage: Access via `op` CLI for templated secrets
- Vault Names: "Private" (personal machines), "Employee" (work machines), "None" (ephemeral)
- Configuration: `home/.chezmoi.toml.tmpl` detects machine type and selects vault
- Template Function: `onepasswordRead` in `.tmpl` files (e.g., `onepasswordRead (printf "op://%s/GitHub PAT/token" .opVault)` in `home/dot_config/homebrew/brew.env.tmpl`)
- Platforms:
  - macOS: Native SSH agent at `$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock`
  - Windows: `1password-cli` via Scoop; Windows Hello biometric auth
  - Linux (WSL2): Wrapper script (`run_onchange_before_20-install-1password.sh.tmpl`) bridges to Windows `op.exe`
  - Linux (native): `1password-cli` via APT with GPG-verified keyring

**GitHub-Hosted Content (External Downloads):**
- PowerLevel10K theme fonts: `https://github.com/romkatv/powerlevel10k-media/raw/master/`
- Oh My Zsh: `https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz`
- Zsh plugins:
  - `zsh-active-cheatsheet`: `https://github.com/norsemangrey/zsh-active-cheatsheet`
  - `powerlevel10k`: `https://github.com/romkatv/powerlevel10k`
- Tmux plugin manager (TPM): `https://github.com/tmux-plugins/tpm`
- Tmux sensible config: `https://github.com/tmux-plugins/tmux-sensible`
- Zinit: `https://github.com/zdharma-continuum/zinit.git`
- Configured via `home/.chezmoiexternal.toml.tmpl` with weekly refresh periods

**GitHub Raw Content (Tool Themes):**
- Eza theme (Catppuccin): `https://raw.githubusercontent.com/eza-community/eza-themes/main/themes/catppuccin-mocha.yml`
- Yazi theme (Catppuccin): `https://raw.githubusercontent.com/catppuccin/yazi/main/themes/mocha/catppuccin-mocha-blue.toml`
- Btop theme (Catppuccin): `https://raw.githubusercontent.com/catppuccin/btop/main/themes/catppuccin_mocha.theme`

**Claude Code (via GitHub):**
- Hooks from `TheDecipherist/claude-code-mastery`:
  - `after-edit.sh`, `block-dangerous-commands.sh`, `block-secrets.py`, `end-of-turn.sh`, `notify.sh`
  - Downloaded to `home/.claude/hooks/` via `home/.chezmoiexternal.toml.tmpl`
- Skills from `TheDecipherist/claude-code-mastery`:
  - `commit-messages` skill in `home/.claude/skills/`
  - `security-audit` skill in `home/.claude/skills/`
- Skills from `edmundmiller/dotfiles` (jj VCS):
  - `jj-history-investigation` in `home/.claude/skills/`
  - `using-jj-workspaces` in `home/.claude/skills/`
- Skills from `mattpocock/skills`:
  - 18 skills: caveman, design-an-interface, domain-model, edit-article, git-guardrails-claude-code, github-triage, grill-me, improve-codebase-architecture, migrate-to-shoehorn, request-refactor-plan, scaffold-exercises, setup-pre-commit, tdd, to-issues, to-prd, triage-issue, ubiquitous-language, write-a-skill, zoom-out

**Personal Memory Vault:**
- Service: GitHub private repository (`git@github.com:Drewtopia/claude-vault.git`)
- Type: Git repository (single shallow clone, no auto-refresh)
- Location: `home/.claude-vault/` symlinked to `home/.claude/memory` (via `home/dot_claude/symlink_memory.tmpl` on macOS/Linux)
- Windows: Junction via PowerShell script (`home/.chezmoiscripts/common/run_after_99-claude-memory-junction.ps1.tmpl`)
- Purpose: Persistent Claude Code memory and agent vault

## Data Storage

**Local Filesystem:**
- Primary storage - All dotfiles and configs under `home/` managed by Chezmoi
- Cache locations (XDG):
  - `~/.cache/` (pip, npm, etc.)
  - `~/.local/state/` (Python history, less history)
  - `~/.local/share/` (Cargo, npm, Rustup, mise, Zinit, Android SDK)
- Secrets location: 1Password vaults (not local files)
- `.ssh_keys` directory: `~/.ssh_keys/` (user-managed, not in chezmoi)

**No Dedicated Databases:**
- No persistent data storage service integrated
- Shell history managed by:
  - Atuin - Encrypted, synced across machines (configured in `home/dot_config/atuin/config.toml.tmpl`)
  - Zsh history in `~/.local/state/zsh/history`

## Caching

**Service:**
- None detected as external service

**Local Caching:**
- Mise caches downloaded tools in `~/.local/share/mise/`
- Neovim tree-sitter parsers compiled to `~/.cache/nvim/`
- Homebrew cache (macOS) managed by Homebrew
- npm/pnpm cache in `~/.cache/pnpm/` and `~/.cache/npm/`

## Authentication & Identity

**Auth Provider:**
- Custom multi-provider approach:
  - GitHub SSH: SSH key in `home/dot_ssh/` (user-managed)
  - GitHub HTTPS: `gh auth git-credential` helper
  - 1Password: Native platform integration + CLI
  - Git signing: SSH key (`~/.ssh/id_ed25519.pub`) on personal machines

**Git Credentials:**
- GitHub: `gh auth git-credential` (configured in `home/dot_config/git/config.tmpl`)
- GitHub Gist: Same `gh` helper
- Azure DevOps: Git Credential Manager on Windows (`/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe` on WSL2, native `manager` alias on Windows)
- Work Git: Platform-specific via Credential Manager on work machines

**SSH Agent:**
- macOS: 1Password SSH agent at `$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock` (requires Windows Hello or biometric on non-ephemeral machines)
- Windows (WSL2): Bridges to Windows 1Password SSH agent via interop
- Linux: Native 1Password CLI agent
- Signing key: `~/.ssh/id_ed25519.pub` (personal machines only for GPG signing)

## Monitoring & Observability

**Error Tracking:**
- Not detected - No external error tracking service

**Logs:**
- Chezmoi applies logged to Chezmoi internal cache
- Shell history via Atuin (encrypted, opt-in cloud sync)
- Git commits tracked via `git log`
- Tool logs:
  - Mise: `~/.local/state/mise/logs/`
  - Topgrade: Console output only
  - Neovim: Via `:messages` and LSP logs in `.local/state/nvim/`

## CI/CD & Deployment

**Hosting:**
- Not applicable - This is a dotfiles repository (personal/team infrastructure)
- Deployed via `chezmoi apply` on target machines
- Updates via `chezmoi update` + `topgrade`

**CI Pipeline:**
- Not detected - No CI/CD pipeline defined
- Manual deployment workflow: `chezmoi pull` + `chezmoi apply`
- Bootstrap: `install.sh` shell script at repo root

## Environment Configuration

**Required Environment Variables:**
- `GITHUB_TOKEN` - Injected by `gh auth token` for Homebrew (`home/dot_config/homebrew/brew.env.tmpl`)
- `OP_VAULT` - Set based on machine type (Private/Employee) for 1Password access
- `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` - Set in `home/dot_zshenv.tmpl`
- Platform-specific:
  - macOS: `SSH_AUTH_SOCK` pointing to 1Password agent
  - Windows: `LOCALAPPDATA/mise/shims` added to PATH
  - Linux: `~/.local/share/mise/shims` added to PATH

**Optional Env Vars:**
- `ZPROF` - Enable Zsh profiling (set before zsh startup)
- `TOPGRADE_NO_SELF_UPGRADE` - Disable topgrade self-update

**Secrets Location:**
- 1Password vaults (Private, Employee)
- SSH keys in `~/.ssh/` (Git SSH, signing)
- GitHub token via `gh auth` (cached in system credential manager)
- Brew GitHub token from 1Password (runtime-injected)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Git credential caching to platform credential managers (Windows GCM, macOS Keychain)
- 1Password SSH agent requests from shell/git
- Atuin shell history sync (if enabled on personal machines)

## External Script Integration

**Claude Code Hooks:**
- Pre-execution hooks from TheDecipherist/claude-code-mastery downloaded and maintained
- Custom security hook: `block-secrets.py` prevents reading `.env*` files
- Integration point: `home/.claude/hooks/` referenced by Claude Code IDE

**Topgrade Integration:**
- Multi-platform package manager updater
- Configured in `home/dot_config/topgrade.toml`
- Disabled steps: `shell` (OMZ managed by chezmoi), `containers` (Docker Desktop not always running), `go` (mise handles Go)

---

*Integration audit: 2026-04-29*
