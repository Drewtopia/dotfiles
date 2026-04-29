# Technology Stack

**Analysis Date:** 2026-04-29

## Languages

**Primary:**
- Bash - Cross-platform shell scripts for Linux/macOS setup
- Zsh - Interactive shell for macOS and Linux (`home/dot_zshrc.tmpl`)
- PowerShell (pwsh 7) - Interactive shell and automation on Windows (`home/Documents/PowerShell/`)
- Go Templates - Chezmoi templating syntax in `.tmpl` files throughout `home/`
- TOML/YAML/JSON - Configuration files for various tools

**Secondary:**
- Lua - Neovim configuration (`home/dot_config/nvim/lua/`)
- Python - Tool integration and environment setup via `uv`, handled through mise
- JavaScript/Node - Via `pnpm` and `npm` managed through mise

## Runtime

**Environment:**
- Chezmoi 2.70.0 - Dotfile manager and configuration templating engine
- Mise - Cross-platform tool/runtime manager (primary for dev tools)
- macOS/Linux/Windows - Multi-platform support with OS-specific branches

**Package Managers:**
- Mise (primary) - Manages runtimes and CLI tools with version pinning
- Homebrew - macOS system packages and casks (`home/.chezmoiscripts/darwin/run_onchange_before_10-install-brew-packages.sh.tmpl`)
- Scoop - Windows package manager (`home/.chezmoiscripts/windows/run_onchange_before_10-install-scoop.ps1.tmpl`)
- APT - Linux (Debian/Ubuntu) package manager (`home/.chezmoiscripts/linux/run_onchange_before_10-install-apt-packages.sh.tmpl`)
- Snap - Linux snaps on Ubuntu (`home/.chezmoiscripts/linux/run_onchange_before_10-install-apt-packages.sh.tmpl`)

## Frameworks

**Core:**
- Chezmoi - Template-driven dotfile management for multi-machine deployments
- LazyVim - Neovim distribution with plugin management (`home/dot_config/nvim/`)
- Oh My Zsh - Zsh configuration framework (`home/.oh-my-zsh/` via chezmoi external)

**Shell Utilities:**
- Zinit - Zsh plugin manager (`home/.local/share/zinit/`) for advanced plugin loading
- Zsh plugins (via Zinit/Oh My Zsh):
  - `fzf-tab` - Fuzzy completion UI
  - `zsh-syntax-highlighting` - Syntax coloring
  - `zsh-active-cheatsheet` - Command cheatsheet

**Version Control:**
- Git - Core VCS
- Jujutsu (jj) - Experimental VCS alternative, managed via mise
- GitHub CLI (gh) - GitHub integration, managed via mise

## Key Dependencies

**Critical (Managed via Mise):**
- `node` / `pnpm` - JavaScript runtime and package manager
- `python` / `uv` - Python runtime and fast package installer
- `deno` - TypeScript runtime
- `bun` - JavaScript runtime alternative
- `go` - Go runtime
- `rust` - Rust toolchain
- `zig` - C/C++ compiler via `zig cc` for native compilation

**CLI Tools (via Aqua backend in Mise):**
- `ripgrep` (rg) - Fast text search
- `bat` - Syntax-highlighted `cat` replacement
- `fd` - Fast `find` replacement
- `fzf` - Fuzzy finder
- `jq` / `yq` - JSON/YAML processors
- `delta` - Git diff viewer
- `lazygit` - Git UI
- `jless` - JSON viewer (Unix-only)
- `eza` - Modern `ls` replacement
- `glow` - Markdown viewer
- `age` - Modern encryption
- `gdu` - Disk usage analyzer
- `golangci-lint` - Go linter
- `gitleaks` - Secret detection
- `topgrade` - Tool updater
- `atuin` - Shell history management
- `carapace` - Completion generator
- `television` - CLI file browser

**NPM Tools (via Mise):**
- `defuddle` - HTML-to-clean-content extractor

**Personal Tools (via Mise, personal machines only):**
- `yt-dlp` - YouTube downloader
- `croc` - File transfer tool

**Infrastructure:**
- `1password-cli` (op) - 1Password integration via Scoop/Brew/APT
- `tmux` - Terminal multiplexer
- `kanata` - Keyboard remapper
- `neovim` - Editor via mise (stable releases tracked)

## Build & Development

**Editors:**
- Neovim - Primary editor via mise, configured with LazyVim
- Language Server Protocol (LSP) - Via `mason.nvim` in Neovim

**Linting & Formatting:**
- `none-ls.nvim` - Unified formatter/linter integration
- `conform.nvim` - Code formatter
- `shellcheck` - Shell script linting
- `stylua` - Lua formatter
- `delta` - Diff viewer

**Testing & Debugging:**
- `neotest` + `neotest-python` - Test runner integration in Neovim
- `nvim-dap` - Debug Adapter Protocol for Neovim
- `nvim-dap-python` - Python debugging

**Other Build Tools:**
- Tree-sitter - Syntax trees for Neovim
- `conform.nvim` - Language formatter integration

## Configuration

**Environment:**
- XDG Base Directory Specification - Used throughout for config organization (`home/dot_zshenv.tmpl`)
  - `XDG_CONFIG_HOME = ~/.config`
  - `XDG_DATA_HOME = ~/.local/share`
  - `XDG_STATE_HOME = ~/.local/state`
  - `XDG_CACHE_HOME = ~/.cache`
- Chezmoi data templating in `home/.chezmoi.toml.tmpl` with conditional per-OS/per-machine setup
- 1Password integration for secret vaults (Private, Employee) defined in config

**Build Configuration:**
- `home/dot_config/mise/config.toml.tmpl` - Mise tool versions and settings
- `home/dot_config/topgrade.toml` - Upgrade tool configuration
- `home/dot_config/git/config.tmpl` - Git configuration with per-OS credential management
- `home/dot_config/nvim/init.lua` - Neovim entry point
- `home/.chezmoi.toml.tmpl` - Chezmoi configuration with feature flags

**Feature Flags (set in Chezmoi config):**
- `dev_computer` - Install dev tools (controls mise setup)
- `personal` - Personal machine (access Private 1Password vault, personal tools)
- `ephemeral` - Ephemeral machine (no secrets)
- `work` - Work machine (access Employee 1Password vault)
- `is_wsl` - Windows Subsystem for Linux detection
- `os` - Operating system (windows, darwin, linux)

## Platform Requirements

**Development:**
- Chezmoi 2.70.0+ installed
- 1Password app with CLI integration (macOS via native SSH agent, Windows/Linux via `op` CLI)
- Git installed
- PowerShell 7+ on Windows (bootstraps via PowerShell 5.1 built-in)
- Bash or Zsh on macOS/Linux

**Production (Target Environments):**
- macOS 10.14+ (with Homebrew for system packages)
- Linux - Ubuntu 20.04+, Debian, Raspbian (with APT)
- Windows 10/11 (with Scoop and PowerShell)
- WSL2 with Linux distribution for Windows interop

**Minimum Specs:**
- 4GB RAM (for Mise toolchain compilation, zig, and Rust builds)
- 5GB free disk (tools, caches, neovim tree-sitter parsers)
- Network access (GitHub for repo clones, tool downloads, 1Password sync)

---

*Stack analysis: 2026-04-29*
