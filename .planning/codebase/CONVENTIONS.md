# Coding Conventions

**Analysis Date:** 2026-04-29

## Naming Patterns

**Files:**
- Bash scripts: `.sh` or `.sh.tmpl` extension
- PowerShell scripts: `.ps1` or `.ps1.tmpl` extension
- Chezmoi lifecycle scripts: `run_{before,after,onchange}_NN-{verb}-{noun}.{sh,ps1}.tmpl` (under `home/.chezmoiscripts/{common,darwin,linux,windows}/`)
  - Example: `run_before_03-backup-claude-memory.sh` (`home/.chezmoiscripts/common/run_before_03-backup-claude-memory.sh`)
  - Example: `run_onchange_before_10-install-scoop.ps1.tmpl` (`home/.chezmoiscripts/windows/`)
  - Numeric prefix `NN` controls execution order within a `run_*` lifecycle phase
- Shell configuration fragments: `0NN-{name}.sh.tmpl` (in `home/dot_config/shell/`)
  - Example: `010-mise.sh.tmpl`, `050-common-aliases.sh.tmpl`

**Chezmoi filename prefixes** (semantic, consumed by chezmoi):
- `dot_*` → deployed as `.*` (hidden files)
- `private_*` → set to `0600` permissions on deploy
- `executable_*` → set executable bit on deploy
- `exact_*` → directory must match exactly (chezmoi removes untracked files in target)
- `empty_*` → empty file/dir at destination
- `run_onchange_*` → script re-runs only when its content hash changes
- `.tmpl` suffix → file is templated through Go template at apply time

**Functions:**
- Bash/Zsh: lowercase with hyphens (e.g., `kanata-status`)
- PowerShell: PascalCase verb-noun pattern (e.g., `kanata-status`, `kanata-on`, `kanata-off` — note this codebase uses lowercase-hyphenated for these specifically; treat as a local exception)

**Variables:**
- Environment variables: SCREAMING_SNAKE_CASE (`ZPROF`, `XDG_DATA_HOME`, `CARAPACE_BRIDGES`)
- Shell variables: lowercase with underscores (`script_dir`, `bin_dir`)
- Array variables: `declare -a` for explicit declaration
- Go template variables: dotted-path with lowercase keys (`{{ .chezmoi.os }}`, `{{ .dev_computer }}`, `{{ .opVault }}`)

## Code Style

**Formatting:**
- Indentation: 4 spaces (bash, shell scripts, PowerShell)
- No formatter currently configured for repo-level enforcement; manual adherence required

**Linting:**
- No static linter configured at repo level (`shellcheck`/`stylua` available via mise but not wired into CI/pre-commit)
- Implicit expectations: POSIX-friendly shell where possible, modern bash builtins preferred over external commands

**Error Handling (Bash/Zsh):**
- Standard headers: `set -uo pipefail` or `set -eufo pipefail`
  - `home/dot_claude/hooks/executable_jj-block-trunk.sh` uses `set -uo pipefail`
  - `home/.chezmoiscripts/darwin/run_onchange_after_60-configure-dock.sh` uses `set -eufo pipefail`
  - `install.sh` uses simpler `set -e`
- Explicit `exit 0` at script end (idempotent confirmation)
- Error suppression idioms:
  - `2>/dev/null` for silencing stderr
  - `|| true` for non-critical operations
  - Example: `find ... ! -perm -u+x -exec chmod +x {} + 2>/dev/null || true` (`home/.chezmoiscripts/common/run_after_50-fix-claude-plugin-permissions.sh`)
  - Example: `git pull --quiet --rebase --autostash 2>/dev/null || true` (`home/dot_claude/hooks/executable_memory-pull.sh`)
- Trap handlers for cleanup: `trap 'killall Dock' EXIT` (`home/.chezmoiscripts/darwin/run_onchange_after_60-configure-dock.sh`)

**Error Handling (PowerShell):**
- `$ErrorActionPreference = 'Stop'` not pervasive — most scripts use `-ErrorAction SilentlyContinue` per-call instead
- `Get-Command TOOL -ErrorAction SilentlyContinue` followed by `if (...)` guard is the standard tool-availability pattern
- `Write-Host ... -ForegroundColor Red` for error reporting; no structured logging

## Import / Loading Order

**Shell startup chain (zsh on Unix):**
1. `~/.zshenv` — early environment setup (XDG vars, PATH bootstrap, env-only)
2. `~/.zshrc` — interactive shell config (Powerlevel10k, Zinit, Oh My Zsh, plugins, theme)
3. `~/.config/shell-loader.sh` — sourced from `.zshrc:159`, loops over `~/.config/shell/0NN-*.sh` in alphabetical order
4. `~/.zshrc.local` and `~/.dotfiles.local` — machine-specific overrides (not tracked)

**Shell fragments load order** (from `home/dot_config/shell/`, sourced by `shell-loader.sh.tmpl`):
- `000-paths.sh.tmpl` — PATH/MANPATH/FPATH setup
- `010-mise.sh.tmpl` — mise activation, PNPM_HOME
- `020-shell-tools.sh.tmpl` — carapace, zoxide, atuin, etc. inits
- `025-tmux.sh.tmpl` — tmux integration
- `030-system-tools.sh.tmpl` — Homebrew/system-specific
- `040-cheatsheets.sh.tmpl` — Navi
- `050-common-aliases.sh.tmpl` — eza, git, chezmoi aliases

**PowerShell init order** (from `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`):
1. PATH wiring (mise shims, pnpm, WinLibs)
2. `mise activate pwsh` (must run before tool inits below)
3. PSReadLine import (must precede tools that bind keys)
4. Tool inits in specific order: carapace → zoxide → tv → atuin → pay-respects → fnox
   - **Note:** `atuin` deliberately initializes AFTER `tv` so atuin's Ctrl+R handler binds last and wins (tv unconditionally rebinds it)
5. Per-tool functions (kanata-status/on/off)

## Go Template Conventions

**Whitespace control:**
- Use `{{- ... -}}` to trim surrounding whitespace and newlines when the rendered output should not have blank lines
- Use `{{- ...` to trim leading, `... -}}` to trim trailing
- Bare `{{ ... }}` keeps surrounding whitespace (use when the rendered file format is whitespace-sensitive, e.g., YAML)

**Conditionals:**
- Logical operators: `and`, `or`, `not` (not `&&`, `||`, `!`)
- Equality: `eq .a "value"`, `ne .a "value"`
- Standard idioms in this codebase:
  - `{{ if eq .chezmoi.os "windows" }} ... {{ end }}` — OS-specific blocks
  - `{{ if .dev_computer }} ... {{ end }}` — gate dev-tool deployment
  - `{{ if not .ephemeral }} ... {{ end }}` — gate secret loading
  - `{{ if and (not .ephemeral) (not .work) }} ... {{ end }}` — personal non-ephemeral

**Path tests at template time:**
- `lookPath "tool"` — returns binary path if on PATH, empty string otherwise
- `stat "/some/path"` — returns nil if doesn't exist, struct otherwise
- Used to conditionally include sections only when the tool/path exists

**Example** (from `home/dot_config/shell/050-common-aliases.sh.tmpl`):
```tmpl
{{- if lookPath "bat" }}
alias cat=bat
{{- else if lookPath "batcat" }}
alias cat=batcat
{{- end }}
```

## Conditional Logic in Shell

**Bash/Zsh checks:**
- Command existence: `command -v TOOL >/dev/null 2>&1`
  - `if command -v mise >/dev/null 2>&1` (`home/dot_config/shell/010-mise.sh.tmpl`)
- File/dir/symlink existence: `[ -e PATH ]`, `[ -d PATH ]`, `[ -L PATH ]`
  - `[ -e "$TARGET" ] && [ ! -L "$TARGET" ]` (`home/.chezmoiscripts/common/run_before_03-backup-claude-memory.sh`)
- String tests: `[[ -z "$VAR" ]]` (empty), `[[ -n "$VAR" ]]` (non-empty)
- Arithmetic: `(( EXPR ))` for integer comparisons
  - `(( AGE > BRANCH_AGE_WARN_DAYS ))` (`home/dot_claude/hooks/executable_session-start-git-status.sh`)

**PowerShell checks:**
- Command existence: `Get-Command TOOL -ErrorAction SilentlyContinue`
- Module availability: `Get-Module -ListAvailable -Name ModuleName`
- Path existence: `Test-Path $path`
- String matching: `-like`, `-match`, `-contains`, `-notlike`
  - `if ($env:PATH -notlike "*$miseShimPath*")` (`home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`)

## Logging & Output

**Framework:** plain `echo` (bash/zsh) or `Write-Host` (PowerShell). No structured logging.

**Patterns:**
- Status arrows: `echo "→ Backing up pre-existing $TARGET to $BACKUP"`
- stderr for warnings/errors: `echo 'message' >&2`
  - `echo 'Cannot modify trunk or develop - run: jj new' >&2` (`home/dot_claude/hooks/executable_jj-block-trunk.sh`)
- Colored output (PowerShell): `-ForegroundColor Green/Yellow/Red/Cyan`
- Silent for non-essential ops: `2>/dev/null` or `--quiet` flags

**When to log:**
- Status transitions (starting / completed / failed)
- Warnings about deprecated patterns or conditions requiring attention
- Errors that block execution
- NOT noise about "doing nothing" (idempotent skips stay quiet)

## Comments

**When to comment:**
- Non-obvious logic or workarounds (explain *why*, not *what*)
  - `# WSL2: interop enabled but appendWindowsPath=false (set in /etc/wsl.conf)` (`home/dot_zshenv.tmpl`)
- Section headers grouping related code
  - `####################### TOOL ALIASES #######################` (`home/dot_config/shell/050-common-aliases.sh.tmpl`)
- Complex conditionals — explain the precondition

**Style:**
- Bash: `# Comment text` (one space after `#`)
- Section headers: `#` repeated to ~60 columns with text in middle
- Multi-line explanations: each line prefixed with `#`

## Function Design

**Size:** typically under 20 lines; longer scripts are split into modular fragments rather than long functions.

**Return values:**
- Exit code 0 for success, non-zero for failure
- Idempotent ops exit 0 even when the work was already done (no need-to-act → quiet success)

## Module / Export Patterns

**Bash:** `alias` for command shortcuts; `export VAR=value` for environment variables.

**PowerShell:** functions and variables defined at profile scope are auto-exported within the session.

**Multi-shell support** (from `home/dot_config/shell/010-mise.sh.tmpl`):
```bash
if [[ -n ${ZSH_NAME} ]]; then
    eval "$(mise completion zsh)"
elif [[ -n ${BASH} ]]; then
    eval "$(mise completion bash)"
fi
```

## Cross-Cutting Conventions

**Idempotency:**
- Every `run_*` script is safe to run multiple times.
- Backup scripts only act if conditions met (e.g., `[ -e TARGET ] && [ ! -L TARGET ]`).
- Tool inits check command existence before running setup.

**XDG compliance:**
- All XDG Base Directory variables set in `home/dot_zshenv.tmpl`:
  - `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`
- Application homes redirected via env vars where the tool supports it:
  - `CARGO_HOME="$XDG_DATA_HOME/cargo"`, `RUSTUP_HOME=...`, etc.

**Cross-platform branching:**
- Always wrap platform-specific code in conditionals:
  - Templates: `{{ if eq .chezmoi.os "darwin" }} ... {{ end }}`
  - Shell runtime: `if [[ "$OSTYPE" == "darwin"* ]]; then ... fi`
- Never assume a binary or path exists on all platforms.

**Secret handling:**
- Secrets never committed.
- Fetched from 1Password at apply time via `{{ onepasswordRead "op://Vault/Item/field" }}` template function.
- Vault selection driven by `.opVault` data variable (`Private` for personal, `Employee` for work).

---

*Conventions analysis: 2026-04-29*
