<!-- refreshed: 2026-04-29 -->
# Architecture

**Analysis Date:** 2026-04-29

## System Overview

This is a chezmoi-managed dotfiles repository providing cross-platform configuration management for personal development environments. The architecture separates deployment-time concerns (chezmoi templates, lifecycle hooks) from runtime shell configuration loading.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Layer                              │
│  chezmoi CLI (.chezmoi.toml.tmpl → Go templates + prompts)       │
├──────────────────────┬──────────────────┬───────────────────────┤
│  External Downloads  │  Template Render │   Lifecycle Hooks     │
│  (→ .chezmoiexternal │   (→ dot_* files,│  (→ run_before_*,    │
│   .toml.tmpl)        │   shell-loader)  │   run_after_*,        │
│                      │                  │   run_onchange_*)     │
└──────────┬───────────┴────────┬─────────┴──────────┬────────────┘
           │                    │                     │
           ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Deployed Dotfiles Layer                        │
│            (→ $HOME/.config, $HOME/.zshrc, etc.)                 │
│  • Managed files (dot_*)                                         │
│  • External repos (oh-my-zsh, plugins, themes, tools)            │
│  • Run scripts executed on apply                                 │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│               Runtime Shell Configuration                         │
│           shell-loader.sh + numbered fragment system             │
│  Sources ~/.config/shell/*.sh in order (000-*, 010-*, etc.)      │
│  Coordinates: PATH, aliases, tool initialization, completions   │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│         Installed Tools & Generated Configs                       │
│  • mise (runtime version manager)                                │
│  • Git, Tmux, Neovim, CLI tools (bat, fd, rg, fzf, etc.)         │
│  • Generated shell fragments from run scripts                    │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| **Chezmoi Config** | Template variables, environment detection, merge strategy | `home/.chezmoi.toml.tmpl` |
| **Template Data** | Feature flags (ephemeral, work, personal), constants | `home/.chezmoidata/` |
| **External Downloads** | Fetch frameworks, plugins, tools, fonts | `home/.chezmoiexternal.toml.tmpl` |
| **Shell Init** | Zsh/Bash startup, prompt, plugins | `home/dot_zshrc.tmpl`, `home/dot_zshenv.tmpl`, `home/dot_zprofile.tmpl` |
| **Shell Loader** | Read and source all `~/.config/shell/*.sh` fragments | `home/dot_config/shell-loader.sh.tmpl` |
| **Shell Fragments** | Modular configs (PATH, mise, aliases, tools) | `home/dot_config/shell/0*-*.sh.tmpl` |
| **Template Functions** | Bash helpers for install scripts | `home/.chezmoitemplates/` |
| **Platform Lifecycle** | OS-specific setup (before/after/onchange) | `home/.chezmoiscripts/{common,darwin,linux,windows}/` |
| **Tool Configuration** | Git, tmux, neovim, mise, and CLI tool configs | `home/dot_config/{git,tmux,nvim,mise,gh,bat,...}/` |
| **Home Directories** | Windows-specific app configs | `home/AppData/`, `home/Documents/` |

## Pattern Overview

**Overall:** Declarative, templated configuration management with modular shell initialization.

**Key Characteristics:**
- **Source of truth is chezmoi**: All deployments generated from templates in `home/`
- **Cross-platform conditionals**: All platforms (macOS, Linux, Windows) supported via `{{ if eq .chezmoi.os "..." }}`
- **Modular shell config**: Shell setup split into numbered fragments sourced by a loader script to avoid monolithic initialization
- **Feature flags in template data**: Machine classification (ephemeral, work, personal) drives secret access, tool installation
- **1Password integration**: Secrets fetched at chezmoi apply time or shell init time, not stored in repo
- **External dependency management**: oh-my-zsh, plugins, themes, tools installed via `.chezmoiexternal.toml.tmpl`
- **Lifecycle hooks on apply**: Run scripts for platform-specific setup (scoop/homebrew, tool installation, config generation)

## Layers

**Deployment & Initialization Layer:**
- Purpose: Render templates and orchestrate one-time setup on `chezmoi apply`
- Location: `home/.chezmoi.toml.tmpl`, `home/.chezmoiscripts/`, `home/.chezmoiexternal.toml.tmpl`
- Contains: Go templates with conditional logic, bash/pwsh run scripts
- Depends on: Chezmoi CLI, package managers (Scoop on Windows, Homebrew on macOS, apt on Linux), 1Password CLI
- Used by: `chezmoi apply` invocation during bootstrap or updates

**Dotfiles Layer:**
- Purpose: Represent the desired state of configuration files deployed to `$HOME`
- Location: `home/` directory tree
- Contains: Template files (`*.tmpl`), direct files, directories (exact_*, empty_*)
- Depends on: Nothing (read-only after deployment)
- Used by: Shell initialization, applications loading configs from standard locations

**Runtime Shell Configuration Layer:**
- Purpose: Set up working shell environment (PATH, aliases, tool activation, completions)
- Location: `home/dot_config/shell/` + `home/dot_config/shell-loader.sh.tmpl`
- Contains: Numbered shell fragment files (000-*, 010-*, etc.) sourced in order
- Depends on: Deployed dotfiles (especially `~/.zshrc` which sources the loader)
- Used by: Every shell session initialization

**Tool Configuration Layer:**
- Purpose: Tool-specific configuration files (Git, Tmux, Neovim, CLI tools)
- Location: `home/dot_config/{tool}/` subdirectories
- Contains: Configuration files (toml, json, lua, vim, etc.)
- Depends on: Tool binaries installed via package managers or mise
- Used by: Individual tools when invoked

## Data Flow

### Primary Initialization Flow: `chezmoi apply`

1. **Environment Detection** (`home/.chezmoi.toml.tmpl` lines 1-78)
   - Detect OS (windows/darwin/linux), hostname, kernel (WSL)
   - Classify machine: ephemeral (cloud/VM), work, or personal
   - Choose 1Password vault based on classification
   - Store in template variables: `.ephemeral`, `.work`, `.personal`, `.opVault`, `.dev_computer`

2. **Template Rendering** (chezmoi)
   - Render all `*.tmpl` files using Go template syntax
   - Substitute environment variables and template data
   - Deploy non-templated files (dot_p10k.zsh, etc.) as-is
   - Handle special file types: `exact_` (recreate exactly), `empty_` (create empty)

3. **External Dependencies** (`home/.chezmoiexternal.toml.tmpl`)
   - Download and extract oh-my-zsh (full framework + selected plugins)
   - Clone Zinit plugin manager
   - Clone private vault repo (git-repo, no refresh period → manual sync)
   - Download theme files (Powerlevel10k, Catppuccin)
   - Download tool themes and Claude Code hooks/skills
   - Update fonts (MesloLGS NF) for terminal rendering

4. **Lifecycle Hooks Execution** (in order):
   - `run_before_*` scripts: Install package managers (Scoop on Windows, Homebrew on macOS)
   - `run_after_*` scripts: Install mise tools, configure shell tools, set Git origin
   - `run_onchange_*` scripts: Conditional setup (run only if content hash changes)
   - **Execution environment**: bash/zsh on Unix, pwsh on Windows

5. **Shell Configuration Generation** (run scripts)
   - Run scripts invoke `write_tool_config()` to generate `~/.config/shell/{tool}.sh` fragments
   - These fragments contain tool-specific PATH, aliases, completions
   - Written by: `run_after_20-configure-shell-tools.sh.tmpl` and individual tool installers

### Runtime Shell Initialization Flow: `zsh` session start

1. **Zsh RC Execution** (`~/.zshrc`)
   - Early exit if non-interactive shell
   - Load Powerlevel10k instant prompt
   - Set up Oh My Zsh with Zinit plugin manager
   - Initialize essential plugins (fzf-tab, zsh-syntax-highlighting)

2. **Shell Loader Invocation** (`~/.zshrc` line 159)
   - Source `~/.config/shell-loader.sh`
   - Shell loader iterates over `~/.config/shell/*.sh` files in alphabetical order

3. **Shell Fragments Sourcing** (`~/.config/shell-loader.sh`)
   ```
   000-paths.sh         → Standard PATH, MANPATH, FPATH setup
   010-mise.sh          → Activate mise, set PNPM_HOME
   020-shell-tools.sh   → Initialize carapace completions, tool activation
   025-tmux.sh          → Tmux settings
   030-system-tools.sh  → System-specific tools (Homebrew, etc.)
   040-cheatsheets.sh   → Navi cheatsheet setup
   050-common-aliases.sh → Shell aliases
   ```

4. **Secrets Injection** (`.zshrc` lines 135-142)
   - Fetch GitHub token from 1Password: `onepasswordRead "op://Private/GitHub PAT/token"`
   - Fetch API keys conditionally based on machine type
   - Only injected if not ephemeral machine

5. **Local Overrides** (`~/.zshrc` lines 164-165)
   - Source `~/.zshrc.local` (machine-specific, not tracked)
   - Source `~/.dotfiles.local` (machine-specific, not tracked)

**State Management:**
- **Ephemeral state**: Shell fragments generated at apply time, stored in `~/.config/shell/`
- **Persistent state**: Template variables cached in chezmoi database (first prompt, then reused)
- **Local overrides**: User-specific settings in `.zshrc.local` and `.dotfiles.local` (not in repo)
- **Vault integration**: Private repo (`.claude-vault`) holds memory + agent config, symlinked/junctioned to `~/.claude/memory`

## Key Abstractions

**Template-as-Code (Go Templates):**
- Purpose: Represent configuration state in a source-controllable, DRY manner
- Examples: `home/.chezmoi.toml.tmpl`, `home/dot_config/shell/*.sh.tmpl`, all `*.tmpl` files
- Pattern: Chezmoi reads the template, evaluates conditionals and variable substitutions, writes result to `$HOME`

**Machine Classification via Feature Flags:**
- Purpose: Determine which secrets/tools/features to deploy
- Flags: `ephemeral` (no secrets), `work` (work machine), `personal` (personal machine), `dev_computer` (install dev tools)
- Usage: Gated imports of 1Password secrets, conditional tool installation, filtered shell configurations
- Implementation: `home/.chezmoi.toml.tmpl` sets flags based on hostname and prompts; values stored in template data

**Shell Fragment Loader:**
- Purpose: Avoid monolithic `~/.zshrc`, enable modular configuration management
- Pattern: Numbered files (000-*, 010-*, etc.) sourced in order by `shell-loader.sh`
- Examples: `home/dot_config/shell/000-paths.sh.tmpl`, `home/dot_config/shell/010-mise.sh.tmpl`
- Benefit: New tools can be added by dropping a fragment without editing shell init files

**Templated Run Scripts:**
- Purpose: Execute platform-specific setup during chezmoi apply
- Examples: `home/.chezmoiscripts/windows/run_onchange_before_10-install-scoop.ps1.tmpl`
- Pattern: bash/pwsh scripts templated with `{{ if eq .chezmoi.os "..." }}` for OS-specific logic
- Lifecycle: `run_before_*` (first), `run_after_*` (after file deployment), `run_onchange_*` (conditional)

**External Repository Management:**
- Purpose: Declaratively pull in large dependencies without bloating the dotfiles repo
- Examples: oh-my-zsh, Zinit, Tmux TPM, .claude-vault
- Pattern: `home/.chezmoiexternal.toml.tmpl` specifies URL, type (archive, git-repo, file), refresh period
- Benefit: Plugins, themes, private vault stay versioned independently

## Entry Points

**Chezmoi Apply (Bootstrap / Update):**
- Location: User invokes `chezmoi apply` in terminal
- Triggers: Manual user action or automated update
- Responsibilities: 
  - Render templates with current environment and stored data
  - Download externals (plugins, themes, tools)
  - Copy/update files to `$HOME`
  - Run lifecycle hooks in order
  - Cache template variables for future applies

**Zsh Session Start:**
- Location: User opens terminal/shell session
- Triggers: Opening terminal, `exec zsh`, SSH session
- Responsibilities: 
  - Load Powerlevel10k prompt
  - Load Oh My Zsh framework with plugins
  - Source shell fragments (loader)
  - Set up environment (PATH, aliases, completions)
  - Fetch secrets from 1Password (if not ephemeral)

**Run Scripts (Platform-Specific Setup):**
- Location: `home/.chezmoiscripts/{common,darwin,linux,windows}/run_{before,after,onchange}_*.sh.tmpl`
- Triggers: During `chezmoi apply`, in order of script name
- Responsibilities: 
  - Install package managers (Scoop, Homebrew)
  - Install and configure tools (mise, git, 1Password CLI)
  - Generate shell configuration fragments
  - Set up system integrations (Git origin, Claude Code hooks)

## Architectural Constraints

- **Platform diversity**: Windows uses PowerShell (Scoop, mise setup), macOS/Linux use Bash (Homebrew, apt, mise). Zsh is the interactive shell on all platforms. Conditionals everywhere: `{{ if eq .chezmoi.os "..." }}`

- **Single source of truth**: Chezmoi manages all dotfiles; local overrides (`.zshrc.local`, `.dotfiles.local`) are permitted but not tracked. Any manual edits outside these files will be overwritten on next apply.

- **Secrets never committed**: All sensitive data (API keys, tokens, passwords) fetched from 1Password at apply time (`.chezmoi.toml.tmpl` lines 135-142) or shell init time. `.env` files do not exist in repo.

- **No external state dependencies**: The repository assumes 1Password CLI (`op`) is available and user is logged in. If `op` is not available, ephemeral machines skip secrets entirely.

- **Circular loading protection**: Shell loader sources fragments in order; ensure no fragment sources itself or creates infinite loops. Template functions are included via `{{ template "function-name" . }}` syntax and executed at apply time, not at shell init.

- **File type constraints**: 
  - `dot_*` files deploy as `.*` files (hidden)
  - `exact_*` directories must match exactly (chezmoi removes untracked files)
  - `empty_*` creates empty files/dirs
  - `run_*` scripts execute in chezmoi's templated scripting environment
  - `.tmpl` files are always templated; non-templated files are copied as-is

- **Windows-specific limitations**:
  - PowerShell Core (`pwsh`) required for full shell integration (not built-in `powershell.exe`)
  - Scoop is the primary package manager (winget unavailable on work machines)
  - Junctions used for `.claude/memory` instead of symlinks (no Developer Mode needed)
  - AppData and Documents directories are Windows-specific paths, not XDG-compatible

## Anti-Patterns

### Hardcoding Machine-Specific Values

**What happens:** Hostnames, usernames, or paths hardcoded in shell fragments instead of using template variables or environment detection.

**Why it's wrong:** Makes configuration non-portable; breaks when changing machines or hostnames; requires manual editing of dotfiles.

**Do this instead:** Use template variables like `.chezmoi.hostname`, `.chezmoi.os`, `.chezmoi.homeDir` (set in `home/.chezmoi.toml.tmpl`). For machine-specific overrides, use `.zshrc.local` or `.dotfiles.local`.

### Monolithic Shell Init Files

**What happens:** All shell configuration crammed into `~/.zshrc` or `~/.bashrc`; adding new tools requires editing a 500+ line file.

**Why it's wrong:** Hard to maintain, merge conflicts on updates, difficult to conditionally include/exclude features.

**Do this instead:** Use the numbered fragment system: create `home/dot_config/shell/060-newtool.sh.tmpl`, templated with feature flags. Shell loader automatically sources it.

### Missing Platform Conditionals

**What happens:** Shell alias or tool configuration written for one platform (e.g., `alias ls='ls -G'` for macOS) applied to all platforms.

**Why it's wrong:** Breaks on unsupported platforms; incompatible flags cause errors.

**Do this instead:** Wrap platform-specific code in conditionals: `{{ if eq .chezmoi.os "darwin" }} ... {{ end }}` in templates, or `if [[ "$OSTYPE" == "darwin"* ]]; then ... fi` in shell fragments.

### Storing Secrets in `.env` or Shell Config

**What happens:** API keys, GitHub tokens, or passwords written to `.env`, `~/.zshrc`, or shell fragments, then accidentally committed.

**Why it's wrong:** Exposes credentials publicly; security incident if credentials are rotated.

**Do this instead:** Use 1Password integration: `{{ onepasswordRead "op://Private/GitHub PAT/token" }}` in templates or `eval $(op signin)` at shell init. Never hardcode secrets.

### Ignoring Chezmoi Externals for Large Dependencies

**What happens:** Cloning oh-my-zsh, Neovim, or other large repos directly into `home/` instead of using `.chezmoiexternal.toml.tmpl`.

**Why it's wrong:** Bloats the dotfiles repo; slow clones/updates; difficult to manage multiple platforms (different Neovim binaries for macOS vs Linux).

**Do this instead:** Define external downloads in `home/.chezmoiexternal.toml.tmpl` with refresh period. Chezmoi handles caching and incremental updates.

## Error Handling

**Strategy:** Fail loudly, log context, skip non-critical setup.

**Patterns:**
- **Run scripts**: Use `set -eufo pipefail` (bash) or `$ErrorActionPreference = 'Stop'` (PowerShell) to fail on error. Wrap non-critical steps in try-catch or condition checks. Example: `command -v mise >/dev/null || echo "mise not found, skipping..."`.
- **Template rendering**: If a template variable is missing or 1Password is unavailable, chezmoi will error. Use conditional blocks: `{{ if and (not .ephemeral) (ne .opVault "") }} ... {{ end }}`.
- **Shell fragments**: If a tool isn't installed, source its fragment anyway (fragment should handle missing binary). Example: `if command -v fzf >/dev/null 2>&1; then ... fi`.

## Cross-Cutting Concerns

**Logging:** 
- Run scripts use `echo` (bash) or `Write-Host` (PowerShell) with color codes for status (`✅`, `⚠️`, `📦`). 
- Shell fragments use `echo` for verbose output (silenced via `>/dev/null` by default).
- No centralized logging framework; each script handles its own output.

**Validation:**
- Machine classification: `home/.chezmoi.toml.tmpl` validates hostname against known personal hosts before skipping prompts.
- Tool availability: Every shell fragment checks `command -v <tool>` before using it.
- Scoop packages: Windows setup script validates package installation with retry logic.

**Authentication:**
- 1Password: User must be logged in (`eval $(op signin)` or 1Password app running). Secrets fetched at apply time and shell init.
- GitHub: GitHub token pulled from 1Password, available as `$GITHUB_TOKEN` for `gh` CLI and mise authentication.
- SSH: Private keys assumed to exist in `~/.ssh/`; SSH agent loaded by shell fragments if available.

---

*Architecture analysis: 2026-04-29*
