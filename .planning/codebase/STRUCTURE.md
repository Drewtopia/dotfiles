# Codebase Structure

**Analysis Date:** 2026-04-29

## Directory Layout

```
.                                    # Repository root
├── home/                            # Source root (chezmoi reads from here)
│   ├── .chezmoi.toml.tmpl          # Chezmoi config: environment detection, data, merge strategy
│   ├── .chezmoiversion             # Chezmoi version lock
│   ├── .chezmoiexternal.toml.tmpl  # External dependency declarations (plugins, themes, tools)
│   ├── .chezmoiignore.tmpl         # Files/dirs to exclude from deployment
│   ├── .chezmoiremove.tmpl         # Files/dirs to remove if they exist
│   ├── .chezmoidata/               # Machine classification constants (read by templates)
│   │   └── constants.toml
│   ├── .chezmoiscripts/            # Lifecycle hook scripts (executed during chezmoi apply)
│   │   ├── common/                 # Run on all platforms
│   │   ├── darwin/                 # Run on macOS only
│   │   ├── linux/                  # Run on Linux only
│   │   └── windows/                # Run on Windows only (PowerShell)
│   ├── .chezmoitemplates/          # Bash function libraries sourced by run scripts
│   │   ├── path-functions          # Helper: manage PATH entries
│   │   ├── shell-config-functions  # Helper: generate shell config fragments
│   │   └── tool-functions          # Helper: install tools (deno, pnpm, bun, uv)
│   │
│   ├── dot_config/                 # XDG config directory (~/.config)
│   │   ├── shell/                  # Modular shell configuration
│   │   │   ├── 000-paths.sh.tmpl
│   │   │   ├── 010-mise.sh.tmpl
│   │   │   ├── 020-shell-tools.sh.tmpl
│   │   │   ├── 025-tmux.sh.tmpl
│   │   │   ├── 030-system-tools.sh.tmpl
│   │   │   ├── 040-cheatsheets.sh.tmpl
│   │   │   └── 050-common-aliases.sh.tmpl
│   │   ├── shell-loader.sh.tmpl    # Sources all shell/*.sh fragments
│   │   ├── git/                    # Git configuration
│   │   ├── tmux/                   # Tmux configuration
│   │   ├── nvim/                   # Neovim configuration
│   │   ├── mise/                   # Mise (runtime manager) config
│   │   ├── zsh/                    # Zsh-specific config
│   │   ├── gh/                     # GitHub CLI config
│   │   ├── bat/                    # Bat (cat replacement) config
│   │   ├── fd/                     # Fd (find replacement) config
│   │   ├── ripgrep/                # Ripgrep config
│   │   ├── atuin/                  # Atuin (shell history) config
│   │   ├── fzf/                    # FZF (fuzzy finder) config
│   │   ├── navi/                   # Navi (cheatsheet) config
│   │   ├── lazygit/                # Lazygit (Git UI) config
│   │   ├── jj/                     # Jujutsu (version control) config
│   │   ├── kanata/                 # Kanata (keyboard remapper) config
│   │   ├── aerospace/              # AeroSpace (window manager on macOS) config
│   │   ├── ghostty/                # Ghostty (terminal) config
│   │   ├── glow/                   # Glow (markdown viewer) config
│   │   ├── ccstatusline/           # ccstatusline config
│   │   ├── leaderkey/              # Leaderkey (keybinding) config
│   │   ├── television/             # Television (file picker) config
│   │   ├── homebrew/               # Homebrew config (macOS)
│   │   └── topgrade.toml           # Topgrade (system upgrader) config
│   │
│   ├── dot_claude/                 # Claude Code integration
│   │   ├── commands/               # Custom Claude commands
│   │   ├── hooks/                  # Claude Code hooks (auto-fetched from external)
│   │   └── skills/                 # Claude Code skills (auto-fetched from external)
│   │
│   ├── dot_local/                  # XDG data directory (~/.local)
│   │   └── share/
│   │       └── man/                # Man pages (local)
│   │
│   ├── dot_ssh/                    # SSH configuration (~/.ssh)
│   │
│   ├── dot_github/                 # GitHub CLI configuration (~/.github)
│   │
│   ├── dot_p10k.zsh               # Powerlevel10k prompt theme config
│   ├── dot_zshrc.tmpl             # Zsh runtime config (main shell init)
│   ├── dot_zshenv.tmpl            # Zsh environment vars (early init)
│   ├── dot_zprofile.tmpl          # Zsh login shell init (macOS/Linux)
│   ├── dot_wslconfig.tmpl         # WSL configuration (Windows only)
│   │
│   ├── empty_dot_hushlogin        # Empty file (suppresses login message)
│   ├── exact_dot_oh-my-zsh/       # Oh My Zsh framework (exact directory, auto-fetched)
│   │
│   ├── AppData/                    # Windows app data (~\AppData)
│   │   └── Roaming/
│   │       └── Code/               # VS Code config (Windows)
│   │
│   ├── Documents/                  # Windows Documents folder (~\Documents)
│   │   └── PowerShell/             # PowerShell profile (Windows)
│   │
│   └── Library/                    # macOS library (~\Library)
│
├── docs/                           # Documentation
│   ├── chezmoi-patterns-guide.md
│   ├── github-auth-architecture.md
│   └── mise-migration-plan.md
│
├── .planning/                      # GSD planning (generated)
│   └── codebase/                   # Architecture docs (ARCHITECTURE.md, STRUCTURE.md, etc.)
│
├── .chezmoiroot                    # Points chezmoi to home/ as source root
├── .chezmoiversion                 # Chezmoi version lock
├── README.md                       # Project overview
├── install.sh                      # Bootstrap script (chezmoi init)
├── .gitignore                      # Git ignore rules
├── .gitattributes                  # Git attributes (line ending, diff)
└── skills-lock.json               # Skills version lock (Claude integration)
```

## Directory Purposes

**`home/`:**
- Purpose: Chezmoi source root (`.chezmoiroot` points here). All files here deployed to `$HOME` on `chezmoi apply`.
- Contains: Templates (*.tmpl), dotfiles (dot_*), scripts (run_*), external definitions, tool configurations.
- Key files: `.chezmoi.toml.tmpl` (entry point), `.chezmoiexternal.toml.tmpl` (dependency declarations).

**`home/.chezmoiscripts/`:**
- Purpose: Lifecycle hooks executed during `chezmoi apply`.
- Structure: Platform-specific subdirectories (common, darwin, linux, windows).
- Execution order: `run_before_*` → file deployment → `run_after_*` → `run_onchange_*`.
- Files are templated with Go syntax (platform detection, feature flags, machine classification).

**`home/.chezmoitemplates/`:**
- Purpose: Bash function libraries included in run scripts via `{{ template "name" . }}`.
- Contains: Functions for managing PATH, writing shell configs, installing tools.
- Usage: Sourced by run scripts to avoid code duplication across platforms.

**`home/dot_config/shell/`:**
- Purpose: Modular shell configuration fragments, sourced in order by `shell-loader.sh`.
- Naming: `NNN-purpose.sh.tmpl` where NNN is execution order (000, 010, 020, ...).
- Pattern: Each file handles one concern (PATH, mise, shell tools, aliases).
- Execution: Sourced at shell init time, not at deploy time.

**`home/dot_config/{tool}/`:**
- Purpose: Tool-specific configuration directories (Git, Tmux, Neovim, etc.).
- Pattern: Mirrors `~/.config/{tool}` structure on deployed system.
- Templating: Some files are templated (feature flags, paths), others static.

**`home/dot_claude/`:**
- Purpose: Claude Code integration (hooks, skills, commands).
- Hooks: Auto-fetched from `claude-code-mastery` GitHub repo; trigger on code edits.
- Skills: Auto-fetched from multiple repos (mattpocock/skills, edmundmiller/dotfiles, etc.).

**`home/AppData/` and `home/Documents/`:**
- Purpose: Windows-specific application directories (not XDG-compatible).
- Deployed to: `%APPDATA%` and `%USERPROFILE%\Documents` on Windows.
- Skipped: On macOS/Linux (chezmoi ignores non-matching OS paths).

**`docs/`:**
- Purpose: Project documentation and architecture guides.
- Contains: Chezmoi patterns, GitHub auth design, mise migration notes.

**`.planning/codebase/`:**
- Purpose: GSD-generated architecture analysis (ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md).
- Generated by: `/gsd-map-codebase` command; not hand-edited.

## Key File Locations

**Entry Points:**
- `home/.chezmoi.toml.tmpl`: Chezmoi configuration (environment detection, data, interpreter settings).
- `home/dot_zshrc.tmpl`: Zsh runtime config (loads Oh My Zsh, sources shell-loader.sh).
- `install.sh`: Bootstrap script (`chezmoi init drewtopia`).

**Configuration:**
- `home/.chezmoiexternal.toml.tmpl`: External dependency declarations (oh-my-zsh, plugins, fonts, themes).
- `home/dot_config/shell-loader.sh.tmpl`: Shell fragment loader.
- `home/dot_config/topgrade.toml`: System upgrader configuration.

**Core Logic:**
- `home/.chezmoiscripts/common/run_after_10-install-mise-tools.sh.tmpl`: Install runtime tools.
- `home/.chezmoiscripts/common/run_onchange_after_20-configure-shell-tools.sh.tmpl`: Generate shell fragments.
- `home/.chezmoiscripts/windows/run_onchange_before_10-install-scoop.ps1.tmpl`: Windows setup (Scoop, XDG vars).

**Testing:**
- `.planning/codebase/`: GSD architecture analysis docs (no test framework; configuration-as-code).

**Tool Configs:**
- `home/dot_config/git/`: Git user config, aliases, hooks.
- `home/dot_config/tmux/`: Tmux keybindings, plugins, theme.
- `home/dot_config/nvim/`: Neovim init and Lua config.
- `home/dot_config/mise/.mise.toml`: Runtime versions (Node, Python, Go, etc.).

## Naming Conventions

**Files:**
- `dot_*`: Deployed as `.*` hidden files (e.g., `dot_zshrc` → `~/.zshrc`).
- `empty_*`: Creates empty file/dir (e.g., `empty_dot_hushlogin` → `~/.hushlogin`).
- `exact_*`: Directory must match exactly (chezmoi removes untracked files, e.g., `exact_dot_oh-my-zsh/`).
- `run_before_*`: Executed before file deployment.
- `run_after_*`: Executed after file deployment.
- `run_onchange_*`: Executed only if content hash changed.
- `*.tmpl`: Templated with Go syntax; rendered at deploy time.

**Directories:**
- `dot_*` prefix: Becomes `.*` hidden directory (e.g., `dot_config` → `~/.config`).
- `AppData/`, `Documents/`, `Library/`: Platform-specific (Windows/macOS/Linux conditionals via chezmoi).
- Tool directories: Named after tool (e.g., `git/`, `nvim/`, `tmux/` under `dot_config/`).

**Shell Fragments:**
- `NNN-purpose.sh.tmpl`: Execution order determined by NNN prefix (000, 010, 020, ...).
- Example: `000-paths.sh.tmpl` (PATH setup) runs before `010-mise.sh.tmpl` (mise activation).

## Where to Add New Code

**New Shell Configuration:**
- Create `home/dot_config/shell/NNN-purpose.sh.tmpl` (pick NNN based on load order).
- Start with `#!/usr/bin/env bash` shebang.
- Use template conditionals for platform-specific code: `{{ if eq .chezmoi.os "windows" }} ... {{ end }}`.
- Use feature flags for optional features: `{{ if .dev_computer }} ... {{ end }}`.
- Shell loader automatically sources files in alphabetical order.

**New Tool Configuration:**
- Create directory `home/dot_config/{tool}/` if not present.
- Add config file(s) matching tool's expected structure (e.g., `config.toml`, `init.lua`).
- Template as needed with Go syntax for environment-specific values.
- Tool will find config at `~/.config/{tool}/` after deployment.

**New Run Script (Setup/Installation):**
- Add to `home/.chezmoiscripts/{platform}/run_{before,after,onchange}_NN-purpose.{sh,ps1}.tmpl`.
- Use `set -eufo pipefail` (bash) or error handling (PowerShell) to fail loudly.
- Use template functions from `home/.chezmoitemplates/` if available.
- Call `{{ template "function-name" . }}` to include reusable functions.
- Platform conditionals: Wrap entire file or sections in `{{- if eq .chezmoi.os "..." -}}`.

**New External Dependency:**
- Add entry to `home/.chezmoiexternal.toml.tmpl`.
- Specify URL, type (archive, git-repo, file), refresh period.
- Example: `[".oh-my-zsh/custom/plugins/myplugin"]` for plugin download.
- Chezmoi handles caching and incremental updates automatically.

**Platform-Specific Setup:**
- Windows: Add PowerShell script to `home/.chezmoiscripts/windows/run_*.ps1.tmpl`.
- macOS: Add bash script to `home/.chezmoiscripts/darwin/run_*.sh.tmpl`.
- Linux: Add bash script to `home/.chezmoiscripts/linux/run_*.sh.tmpl`.
- Common: Add to `home/.chezmoiscripts/common/run_*.sh.tmpl`.

**Machine Classification Logic:**
- Edit `home/.chezmoi.toml.tmpl` to adjust hostname detection, prompts, or feature flags.
- Flags available: `.ephemeral`, `.work`, `.personal`, `.dev_computer`, `.is_wsl`.
- Store derived values in `[data]` section for template access.
- Example: `{{ if .dev_computer }}` gates developer tool installation.

## Special Directories

**`home/exact_dot_oh-my-zsh/`:**
- Purpose: Oh My Zsh framework (managed by external, not hand-edited).
- Generated: Yes (fetched from GitHub on first `chezmoi apply`, updated every 7 days).
- Committed: No (chezmoi tracks externals separately, not in git).
- Note: Exact directory — chezmoi recreates it precisely, removing any untracked files.

**`home/.chezmoitemplates/`:**
- Purpose: Bash function libraries included by run scripts.
- Generated: No (hand-edited).
- Committed: Yes (part of repo).
- Usage: Functions like `write_tool_config()`, `install_deno()` sourced via `{{ template "name" . }}` in run scripts.

**`home/.config/shell/`:**
- Purpose: Generated shell fragments sourced at shell init time.
- Generated: Yes (by run scripts using `write_tool_config()` function).
- Committed: No (generated at deploy time, varies per machine).
- Pattern: New fragments added by run scripts as tools are installed.

**`home/.claude-vault/`:**
- Purpose: Private repository for memory and agent configuration.
- Generated: No (cloned from private repo on first apply).
- Committed: No (external git repo, symlinked/junctioned to `~/.claude/memory`).
- Refresh: Manual (no auto-refresh period set in `.chezmoiexternal.toml.tmpl`).

---

*Structure analysis: 2026-04-29*
