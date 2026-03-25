# Chezmoi Patterns Guide: Templates, Scripts & Externals

> **Date:** 2026-03-25
> **Purpose:** Document patterns from community dotfiles repos and identify improvements for this setup.
> **Companion:** See `mise-migration-plan.md` for the tool installation migration strategy.

## Table of Contents

- [Current Setup Overview](#current-setup-overview)
- [Templates](#templates)
  - [Current State](#templates-current-state)
  - [Community Patterns](#templates-community-patterns)
  - [Recommendations](#templates-recommendations)
- [Scripts](#scripts)
  - [Current State](#scripts-current-state)
  - [Community Patterns](#scripts-community-patterns)
  - [Recommendations](#scripts-recommendations)
- [Externals](#externals)
  - [Current State](#externals-current-state)
  - [Community Patterns](#externals-community-patterns)
  - [Recommendations](#externals-recommendations)
- [Patterns Considered but Not Adopted](#patterns-considered-but-not-adopted)
- [Reference Repos](#reference-repos)

---

## Current Setup Overview

### Directory Structure

```
chezmoi-repo/
├── docs/                          # Migration plans, this guide
├── install.sh                     # Bootstrap script
├── README.md
└── home/                          # Chezmoi source directory
    ├── .chezmoi.toml.tmpl         # Config with data, prompts, feature flags
    ├── .chezmoiexternal.toml.tmpl # External downloads (single file)
    ├── .chezmoiignore.tmpl        # OS-conditional ignores
    ├── .chezmoiremove.tmpl        # Files to remove
    ├── .chezmoitemplates/         # 4 reusable partials
    │   ├── path-functions
    │   ├── shell-config-functions
    │   ├── shared_script_utils.bash
    │   └── tool-functions
    ├── .chezmoiscripts/
    │   ├── darwin/                 # macOS-specific scripts
    │   ├── linux/                  # Linux-specific scripts
    │   ├── windows/                # Windows-specific scripts
    │   └── (cross-platform scripts)
    ├── dot_config/                 # XDG config files
    ├── dot_zshrc.tmpl             # Zsh config
    └── ...
```

### Data Variables (from `.chezmoi.toml.tmpl`)

| Variable | Type | Source | Purpose |
|----------|------|--------|---------|
| `dev_computer` | bool | `promptBoolOnce` | Gate dev tool installation |
| `ephemeral` | bool | Auto-detected / prompt | Skip secrets on throwaway machines |
| `work` | bool | Hostname / prompt | Work vs personal email/vault |
| `headless` | bool | Auto-detected / prompt | Skip GUI configs |
| `personal` | bool | Hostname / prompt | Personal machine flag |
| `is_wsl` | bool | Kernel detection | WSL-specific paths |
| `hostname` | string | `scutil`/chezmoi | Reliable hostname (macOS fix) |
| `device_type` | string | Hardware detection | "laptop" or "desktop" |
| `osid` | string | Computed | "linux-ubuntu", "darwin", "windows" |
| `zshPlugins` | list | OS-conditional | Oh-my-zsh plugins to load |
| `xdg*Dir` | string | Computed | XDG directory paths |

---

## Templates

### Templates: Current State

**Config template** (`.chezmoi.toml.tmpl`):
- Well-structured with hostname-based auto-detection for known machines
- Falls back to interactive prompts via `promptBoolOnce` when TTY available
- Defaults to ephemeral/headless when non-interactive (CI, SSH)
- Device type detection across all 3 platforms (sysctl, hostnamectl, PowerShell CIM)
- Windows interpreter config for PowerShell 5.1 bootstrapping

**Template partials** (`.chezmoitemplates/`):
- `path-functions` — PATH management helpers (add, append, remove, dedupe)
- `shell-config-functions` — Write/remove tool configs to `~/.config/shell/`
- `tool-functions` — Install functions for deno, pnpm, bun, uv (includes completions)
- `shared_script_utils.bash` — Comprehensive logging, error handling, color utilities

**Template usage in configs**:
- `dot_zshrc.tmpl` — OS-conditional plugin lists via `{{ range .zshPlugins }}`
- `.chezmoiignore.tmpl` — OS-conditional file exclusions
- `.chezmoiexternal.toml.tmpl` — OS-conditional binary downloads, font directory paths

### Templates: Community Patterns

#### Pattern 1: Data Files for Separation of Concerns
**Used by:** ivy, noidilin, sebastienrousseau

Instead of embedding all data in `.chezmoi.toml.tmpl`, use `.chezmoidata/` files:

```yaml
# .chezmoidata/tools.yaml
cliTools:
  - name: bat
    repo: sharkdp/bat
    backend: aqua
  - name: delta
    repo: dandavison/delta
    backend: aqua

tmuxPlugins:
  - name: tpm
    repo: tmux-plugins/tpm
    commit: 99469c4a9b1ccf77fade25842dc7bafbc8ce9946
```

Then use in templates: `{{ range .tmuxPlugins }}`. Benefits:
- Data is editable without touching template logic
- YAML is more readable for lists/maps than TOML inline
- Renovate can auto-update commit SHAs in data files
- Separates "what to install" from "how to install"

#### Pattern 2: Feature Flags via `.chezmoidata.toml`
**Used by:** sebastienrousseau, nfielder

```toml
# .chezmoidata.toml
[features]
kubernetes_tools = false
ai_tools = true
nerdfont = true
alias_wrapper = false
```

Used in templates: `{{ if .features.ai_tools }}`. Benefits:
- Toggle entire tool groups without editing multiple files
- Self-documenting — all feature toggles in one place
- Easy to diff between machines

#### Pattern 3: `{{ include }}` for Reusable Install Scripts
**Used by:** shunk031

Install scripts live in a separate `install/` directory and are `{{ include }}`d into chezmoi scripts:

```bash
# .chezmoiscripts/common/run_once_after_01-install-mise.sh.tmpl
{{ include "../install/common/mise.sh" }}
```

The included scripts have dual-mode guards:
```bash
main() { ... }
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main; fi
```

Benefits:
- Scripts can be tested standalone outside chezmoi
- Same script used in CI and chezmoi
- DRY — one install function shared across platforms

#### Pattern 4: Glob-Based Template Composition
**Used by:** sebastienrousseau

Auto-discover and compose files from a directory:

```
{{ $globPattern := joinPath .chezmoi.sourceDir ".chezmoitemplates/aliases/**/*.aliases.sh" }}
{{ $files := glob $globPattern }}
{{ range $files }}
  {{ include . }}
{{ end }}
```

Benefits:
- Add a new alias file → automatically included, no template edits needed
- Scales without touching the main template

#### Pattern 5: `lookPath` Guards in External Templates
**Used by:** ivy, jamebus, halostatue

```toml
{{ if lookPath "zsh" }}
[".oh-my-zsh"]
    type = "archive"
    url = "..."
{{ end }}

{{ if lookPath "cargo" }}
[".local/src/hk"]
    type = "git-repo"
    url = "..."
{{ end }}
```

Benefits:
- Only downloads externals for tools actually present
- Graceful degradation on minimal systems

#### Pattern 6: `HOMEBREW_FORBIDDEN_FORMULAE`
**Used by:** shunk031

Prevent brew from accidentally installing tools that mise manages:

```bash
export HOMEBREW_FORBIDDEN_FORMULAE="node python python3 pip npm pnpm yarn"
```

Benefits:
- Prevents `brew install python` from conflicting with mise's python
- Enforces clear ownership boundaries

#### Pattern 7: Computed Variables in Config Template
**Used by:** your setup (well done), shunk031, sebastienrousseau

Your `.chezmoi.toml.tmpl` already does this well:
- Device type detection via platform-specific commands
- Hostname normalization (macOS `scutil` workaround)
- WSL detection via kernel string
- Auto-detection of known hostnames

#### Pattern 8: Custom Template Delimiters
**Used by:** halostatue

```yaml
# chezmoi:template:left-delimiter="${{" right-delimiter="}}"
```

Benefits:
- Avoids conflicts when managing files that use `{{ }}` syntax (Go templates, Helm charts, GitHub Actions)

#### Pattern 9: Composable `.chezmoiignore` via Template Partials
**Used by:** shunk031

Instead of one monolithic ignore file, compose from partials in `.chezmoitemplates/`:

```
{{ template "chezmoiignore.d/common" . }}
{{ if eq .chezmoi.os "darwin" -}}
{{   template "chezmoiignore.d/macos" . }}
{{ else if eq .chezmoi.os "linux" -}}
{{   template "chezmoiignore.d/ubuntu/common" . }}
{{   if eq .system "client" -}}
{{     template "chezmoiignore.d/ubuntu/client" . }}
{{   else if eq .system "server" -}}
{{     template "chezmoiignore.d/ubuntu/server" . }}
{{   end -}}
{{ end -}}
```

Benefits:
- Each platform's ignores are maintainable independently
- Multi-axis conditionals (OS x role) stay readable

#### Pattern 10: Data-Driven Aliases with Fallback Chains
**Used by:** ivy

```yaml
# .chezmoidata/aliases.yaml
aliases:
  replacements:
    - { tool: bat, replaces: cat }
    - { tool: duf, replaces: df }
  fallbacks:
    - replaces: ls
      chain:
        - { tool: eza, command: "eza --icons=always --group-directories-first" }
        - { tool: gls, command: gls }
```

Consumed with `lookPath` guards — first available tool in the chain wins:
```
{{- range .aliases.fallbacks }}
{{-   $matched := false }}
{{-   range .chain }}
{{-     if and (not $matched) (lookPath .tool) }}
{{-       $matched = true }}
alias {{ $replaces }}='{{ .command }}'
{{-     end }}
{{-   end }}
{{- end }}
```

#### Pattern 11: `output` + `fromJson` at Template Time
**Used by:** ivy

Run external commands during `chezmoi apply` and parse their output:

```
{{- $models := output (joinPath .chezmoi.workingTree "bin" "resolve-bedrock-models") | fromJson }}
model: {{ index $models .tier }}
```

Also used for generating completions at apply-time:
```
{{- if lookPath "atuin" -}}
{{ output "atuin" "gen-completions" "--shell" "zsh" -}}
{{- end -}}
```

#### Pattern 12: `env "SSH_CONNECTION"` for Context Awareness
**Used by:** martinemde

Skip 1Password-dependent files when SSH'd in (biometric unavailable):
```
{{ if env "SSH_CONNECTION" }}
.config/zsh/secrets.zsh
{{ end }}
```

#### Pattern 13: `{{ fail }}` for Unsupported Platforms
**Used by:** shunk031, sebastienrousseau

Hard error instead of silent misconfiguration:
```
{{ if eq .chezmoi.os "linux" }}
{{   if eq .chezmoi.osRelease.idLike "debian" }}
{{     include "../install/ubuntu/common/dependencies.sh" }}
{{   else }}
{{     fail (printf "Invalid linux distribution: %s" .chezmoi.osRelease.id) }}
{{   end }}
{{ end }}
```

#### Pattern 14: Cross-Platform Script Libraries in `.chezmoitemplates/`
**Used by:** noidilin

Parallel bash/powershell libraries for DRY cross-platform scripts:

```
.chezmoitemplates/scripts/
  error-policy.sh          # Bash: soft failure + summary
  error-policy.ps1         # PowerShell equivalent
  lib/
    bash/
      common.sh            # Colors, print_header, require_command
      brew.sh              # brew_install_package with idempotency
      cargo.sh, pacman.sh, pnpm.sh, uv.sh
    powershell/
      common.ps1           # Write-InfoLine, Assert-CommandOrExit
      scoop.ps1            # Install-ScoopPackage with idempotency
      winget.ps1, cargo.ps1, pnpm.ps1, uv.ps1
```

Included at the top of each script:
```bash
{{ include ".chezmoitemplates/scripts/error-policy.sh" }}
{{ include ".chezmoitemplates/scripts/lib/bash/common.sh" }}
{{ include ".chezmoitemplates/scripts/lib/bash/brew.sh" }}
```

#### Pattern 15: Data-Driven Cross-Platform Packages
**Used by:** noidilin, ivy

Single YAML maps each tool to all package managers:

```yaml
# .chezmoidata/pm/common.yml
pkgs:
  common:
    bat:
      brew: "bat"
      scoop: "bat"
      pacman: "bat"
    localsend:
      brew: "--cask localsend"
      scoop: "localsend"
      wsl: false          # GUI app, skip on WSL
```

Scripts iterate with `{{ range }}`:
```bash
{{- range $name, $pkg := .pkgs.common }}
{{-   if hasKey $pkg "brew" }}
brew install "{{ $pkg.brew }}"
{{-   end }}
{{- end }}
```

Benefits:
- One place to see all packages across all platforms
- Adding a tool = one YAML entry, not editing 3+ scripts
- `wsl: false` flag for GUI app exclusion

### Templates: Recommendations

#### Adopt: Feature Flags via `.chezmoidata.toml`

Currently, your only toggleable data variable is `dev_computer`. As the mise migration adds tool groups, feature flags would help:

```toml
# home/.chezmoidata.toml
[features]
ai_tools = true        # claude-code, etc.
kubernetes = false      # kubectl, k9s, helm
```

This is lightweight and doesn't require restructuring. Use `{{ if .features.ai_tools }}` in mise config template.

#### Adopt: `lookPath` Guards in Externals

Your `.chezmoiexternal.toml.tmpl` currently uses `{{ if eq .osid "linux-ubuntu" }}` for binary downloads. Consider adding `lookPath` guards for tools that might already be installed:

```toml
{{ if and (not (lookPath "nvim")) (eq .osid "linux-ubuntu") }}
[".local/bin/nvim"]
    type = "file"
    url = "https://github.com/neovim/neovim/releases/download/stable/nvim-linux-x86_64.appimage"
{{ end }}
```

#### Adopt: `HOMEBREW_FORBIDDEN_FORMULAE`

Once tools move to mise, add to your shell config to prevent brew from reinstalling them.

#### Consider Later: `.chezmoidata/` Split

Your data needs are currently modest (fits in `.chezmoi.toml.tmpl`). If the mise config grows to 30+ tools with per-tool metadata, split data files would help. Not needed yet.

#### Consider Later: Glob-Based Composition

Your alias/shell config setup is currently manageable with explicit `source` commands. If it grows significantly, the glob pattern would reduce maintenance.

---

## Scripts

### Scripts: Current State

**Naming convention:**
```
run_onchange_before_*   — Install packages (triggered by content hash)
run_onchange_after_*    — Configure tools, install mise tools
run_once_after_*        — One-time cleanup tasks
```

**Platform separation:** Scripts in `darwin/`, `linux/`, `windows/` directories.

**Ordering:** Numeric prefixes where needed:
- `00-install-pwsh.ps1` — PowerShell 7 (must be first on Windows)
- `01-install-scoop.ps1` — Scoop package manager
- `200-install-mise-tools` — After packages installed
- `300-setup-kanata` — After everything else

**Hash triggers:** mise tool scripts use `{{ include "dot_config/mise/config.toml.tmpl" | sha256sum }}` to re-run when config changes.

**Current scripts inventory** (updated 2026-03-25):

| Script | Platform | Trigger | Purpose | Notes |
|--------|----------|---------|---------|-------|
| `run_onchange_before_00-install-pwsh` | Windows | content | Install PowerShell 7 | Clean |
| `run_onchange_before_01-install-scoop` | Windows | content | Install Scoop + packages | Clean |
| `run_onchange_before_install-packages` | All | content | Platform package managers + mise install | **Has redundant `mise install` — remove** (mise installer already runs it) |
| `run_onchange_before_install-op` | Linux | content | 1Password CLI (Ubuntu) | Clean |
| `run_onchange_before_install-1password-cli-*` | Windows/Linux | content | 1Password CLI | Clean |
| `run_onchange_after_200-install-mise-tools` | All | mise config hash | `mise install` on config change | Correct pattern — keep |
| `run_onchange_after_300-setup-kanata` | macOS/Windows | content | Kanata keyboard | Clean |
| `run_onchange_after_configure-tools` | Unix | content | fzf, gh aliases, completions | fzf block removed in Phase 2 |
| `run_onchange_after_install-claude-code*` | All | content | Claude Code CLI | Clean |
| `run_onchange_after_set-origin-url` | All | content | Git SSH origin | Clean |
| `run_onchange_after_chsh` | Linux | content | Change default shell | Clean |
| `run_once_after_cleanup-renamed-shell-configs` | Unix | once | Migration cleanup | Clean |

**Key insight (2026-03-25):** The "scripts doing too much" concern is primarily about `install-packages` bundling mise setup. However, the fix is NOT to split into many small scripts — it's to (a) remove the redundant `mise install` call, and (b) let the mise migration naturally slim down the package lists as tools move to `config.toml.tmpl`.

### Scripts: Community Patterns

#### Pattern 1: `00-` Prefix for Ordering
**Used by:** martinemde, shunk031, sebastienrousseau

Establish clear execution order:
```
run_onchange_00-install-mise-tools.sh    # Tools first
run_onchange_10-darwin-packages.sh       # Platform packages
run_onchange_20-darwin-defaults.sh       # System preferences
run_onchange_25-python-tools.sh          # Language-specific
run_onchange_30-vscode-extensions.sh     # App configs
run_onchange_50-install-fonts.sh         # Last
```

Your setup already uses numeric prefixes (00, 01, 200, 300). Consider normalizing to a consistent scheme.

#### Pattern 2: Hashing Strategies for `run_onchange_`
**Used by:** martinemde, ivy, sebastienrousseau

The `run_onchange_` trigger depends on a hash comment in the script. Different strategies control precision:

**a) Full config hash** (current approach — simplest):
```bash
# mise config hash: {{ include "dot_config/mise/config.toml.tmpl" | sha256sum }}
```
Re-runs when *anything* in the config changes.

**b) `regexFind` sub-hashing** (martinemde — most precise):
```bash
# python version: {{ include "dot_config/mise/config.toml.tmpl" | regexFind "python = \"[^\"]*\"" | sha256sum }}
# python tools: {{ include "dot_config/dotfiles/requirements.txt" | sha256sum }}
```
Changing the `jq` version does NOT trigger this Python script. Only triggers when the Python version line or requirements file changes.

**c) Lock file + config hash** (ivy — for pinned versions):
```bash
# mise config hash: {{ include "dot_config/mise/config.toml" | sha256sum }}
# mise lock hash: {{ include "dot_config/mise/mise.lock" | sha256sum }}
```
Triggers when either config or resolved lock versions change.

**d) Composite multi-file hash** (sebastienrousseau):
```bash
# Brewfile hash: {{ printf "%s%s" (include "dot_config/shell/Brewfile.cli") (include "dot_config/shell/Brewfile.cask") | sha256sum }}
```
Change to *either* file triggers the script.

**e) Glob-based hash** (martinemde — for plugin directories):
```bash
# Hash: {{ (glob "dot_config/nvim/lua/plugins/*.lua") | join "" | sha256sum }}
```
Any file added/changed/removed in the directory triggers the script.

Benefits of granular hashing:
- Faster `chezmoi apply` — unrelated changes don't trigger slow reinstalls
- More precise — Python script doesn't re-run when you add a new CLI tool

#### Pattern 3: GITHUB_TOKEN for Rate Limits
**Used by:** martinemde, ivy

```bash
if command -v gh >/dev/null 2>&1; then
    export GITHUB_TOKEN="$(gh auth token 2>/dev/null)" || true
fi
mise install --yes
```

Benefits:
- Prevents 403 errors when installing many tools via aqua/github backends
- Uses existing `gh` auth — no extra token management

#### Pattern 4: `mise trust` Before Install
**Used by:** Hydepwns

```bash
mise trust --all
mise install --yes
```

Benefits:
- Handles first-run trust prompt non-interactively
- Prevents install from hanging waiting for user input

#### Pattern 5: Parallel Installation
**Used by:** lildude, sebastienrousseau

```bash
install_mise() { ... }
install_other_packages() { ... }

install_mise &
pid_mise=$!
install_other_packages &
pid_pkgs=$!

wait $pid_mise
wait $pid_pkgs
```

Benefits:
- Faster bootstrap on fresh machines
- Independent operations don't block each other

#### Pattern 6: Secrets Scanning Post-Apply
**Used by:** martinemde

```bash
# run_after_scan-secrets.sh.tmpl — Runs after EVERY apply
if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --source="$CHEZMOI_SOURCE_DIR" --no-git || true
fi
```

Benefits:
- Catches accidentally committed secrets
- Non-blocking (|| true) — warns but doesn't break apply

#### Pattern 7: Dual Script Extensions
**Used by:** noidilin, your setup

Separate `.sh.tmpl` and `.ps1.tmpl` scripts for Unix and Windows:
```
run_onchange_after_20-mise-tools.sh.tmpl     # Linux/macOS
run_onchange_after_20-mise-tools.ps1.tmpl    # Windows
```

Your setup already does this correctly for mise install and kanata setup.

#### Pattern 8: `run_once_before_` for Bootstrap vs `run_onchange_` for Updates
**Used by:** shunk031

```
run_once_before_01-decrypt-private-key.sh     # One-time setup
run_once_before_03-install-brew.sh            # One-time bootstrap
run_onchange_after_01-install-mise.sh         # Re-run on config change
```

Benefits:
- Bootstrap steps only run once (even if script content changes)
- Configuration steps re-run when relevant content changes

#### Pattern 9: Error Handling Strategy

**martinemde:** Strict — scripts `set -euo pipefail`, individual tool installs use `|| true` for non-critical failures. Scripts `exit 0` on missing dependencies (soft failure), never `exit 1`.

**your setup:** Similar — `set -eufo pipefail` at top, `|| echo "warning"` for mise install failures.

**sebastienrousseau:** Most thorough — custom `warn_unpinned` function that *fails* if any version is `latest` or `nightly`.

**noidilin:** Soft failure with summary report — counts installed/skipped/failed and prints at end:
```bash
record_installed() { ((installed_count += 1)); }
record_failed()    {
    ((failed_count += 1))
    FAILED_ITEMS+=("${manager}:${package}")
    if [[ $strict_mode -eq 1 ]]; then print_summary; exit 1; fi
}
# At end of script:
print_summary  # "12 installed, 2 skipped, 1 failed: scoop:foo"
```
`DOTFILES_STRICT=1` enables fail-fast mode.

#### Pattern 10: `mise prune` After Install
**Used by:** ivy

Clean up old tool versions after installing new ones:
```bash
mise install --yes
mise prune --yes
mise cache prune
```

#### Pattern 11: `lookPath` at Compile-Time for Conditional Scripts
**Used by:** ivy

Generate different shell code depending on what's installed when `chezmoi apply` runs:
```bash
{{- if lookPath "gh" }}
GITHUB_TOKEN=$(gh auth token) mise install --yes
{{- else }}
mise install --yes
{{- end }}
```

This is template-time logic, not runtime — the rendered script only contains one branch.

### Scripts: Recommendations

#### Adopt: Remove Redundant `mise install` from `install-packages` Scripts

**Status:** Identified 2026-03-25. Apply before Phase 1 of mise migration.

The `install-packages` scripts on all three platforms install mise *and* run `mise install`. However, `curl https://mise.run | sh` already runs `mise install --yes` automatically. The explicit call is redundant.

Remove the `mise install` lines from:
- `darwin/run_onchange_before_install-packages.sh.tmpl`
- `linux/run_onchange_before_install-packages.sh.tmpl`
- `windows/run_onchange_before_install-packages.ps1.tmpl`

The `200-install-mise-tools` scripts (which trigger on `config.toml.tmpl` hash change) remain the correct place for subsequent `mise install` runs.

**Important:** Don't split mise installation into its own script. The `install-packages` scripts are the right place for the one-liner curl/irm install since mise needs to exist before the `200-*` scripts can run. The migration will naturally slim down `install-packages` as tools move to mise.

#### Adopt: `no_quarantine` for Quick Look Casks in Brew Bundle

**Status:** Implemented 2026-03-25.

Some Homebrew casks (especially deprecated or unsigned Quick Look plugins) need `--no-quarantine` to function. The brew bundle template now conditionally adds `args: { no_quarantine: true }` for specific casks (`glance-chamburr`, `qlmarkdown`). This pattern can be extended to other casks as needed.

#### Adopt: GITHUB_TOKEN in mise install scripts

High-value, low-effort change. Add to all three `run_onchange_after_200-install-mise-tools` scripts:

**Unix:**
```bash
if command -v gh >/dev/null 2>&1; then
    export GITHUB_TOKEN="$(gh auth token 2>/dev/null)" || true
fi
mise install
```

**Windows (PowerShell):**
```powershell
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $env:GITHUB_TOKEN = (gh auth token 2>$null)
}
mise install
```

#### Adopt: `mise trust` Before Install

Add `mise trust --all` before `mise install` in all three scripts. Prevents interactive prompts.

#### Adopt: Consistent Numbering Scheme

Normalize your script numbers to leave room for growth:

```
00-09: Bootstrap (pwsh, scoop, system prereqs)
10-19: Package managers (brew, apt, winget)
20-29: Mise tools
30-39: Tool configuration (gh aliases, fzf, completions)
40-49: App-specific setup (kanata, claude code)
50-59: Post-apply tasks (git origin, chsh)
90-99: One-time migrations / cleanup
```

#### Consider Later: Secrets Scanning

If you add `gitleaks` to your mise config, a `run_after_scan-secrets.sh` would be a good safety net.

#### Consider Later: Granular Hash Triggers

Currently your mise install triggers on the entire config hash — fine for ~20 tools. If it grows to 30+ with slow-building cargo tools, granular hashing would help.

---

## Externals

### Externals: Current State

**Single file:** `home/.chezmoiexternal.toml.tmpl`

**What it manages:**

| Category | Items | Type |
|----------|-------|------|
| CLI binaries (Linux only) | age, croc, cue, eza, gdu, glow, golangci-lint, jless, delta, lazygit, yt-dlp, jj, carapace, uv, nvim | `archive-file` / `file` |
| Fonts (macOS/Linux) | MesloLGS NF (4 variants) | `file` |
| Zsh framework | oh-my-zsh | `archive` |
| Zsh plugins | zsh-active-cheatsheet | `archive` |
| Zsh theme | powerlevel10k | `archive` |
| Tmux plugins | tpm, tmux-sensible | `archive` |
| Zinit | zinit.git | `git-repo` |
| Claude skills | 15+ skills from 3 repos | `archive` |
| Claude hooks | hooks from claude-code-mastery | `archive` |

**Template functions used:**
- `gitHubLatestReleaseAssetURL` — for Linux CLI binary downloads
- `gitHubLatestRelease` — for powerlevel10k tag name
- OS conditionals: `{{ if eq .osid "linux-ubuntu" }}`, `{{ if ne .chezmoi.os "windows" }}`
- Loop: `{{ range (list "font1.ttf" "font2.ttf" ...) }}`
- Computed font directory based on OS

**Refresh periods:** `168h` (weekly) for most items, `72h` for uv, `672h` for nvim.

### Externals: Community Patterns

#### Pattern 1: Split Externals Directory
**Used by:** martinemde, noidilin, BurnerWah

Instead of one monolithic file, split into categorized files:

```
home/.chezmoiexternals/
├── zsh-plugins.toml           # oh-my-zsh, autosuggestions, syntax-highlighting
├── themes.toml                # catppuccin for bat, delta, ghostty
├── tmux.toml                  # tpm, tmux-sensible
├── fonts.toml.tmpl            # OS-conditional font paths
├── claude-skills.toml         # Claude Code skills
└── windows.toml.tmpl          # Windows-only externals
```

Benefits:
- Cleaner diffs — changing a tmux plugin doesn't touch zsh config
- Easier to review and maintain
- Can be OS-conditional per file (`.tmpl` suffix when needed)
- Category-level `refreshPeriod` decisions

#### Pattern 2: Pinned Commits with Renovate Comments
**Used by:** martinemde, ivy

```toml
# renovate: repo=zsh-users/zsh-autosuggestions branch=master
[".zsh/plugins/zsh-autosuggestions"]
type = "git-repo"
url = "https://github.com/zsh-users/zsh-autosuggestions.git"
revision = "85919cd1ffa7d2d5412f6d3fe437ebdbeeec4fc5"
refreshPeriod = "168h"
```

Benefits:
- Deterministic builds — exact same content every time
- Automated version bumps via Renovate PRs
- Audit trail of updates

#### Pattern 3: Archive Instead of git-repo
**Used by:** ivy, your setup (for oh-my-zsh)

```toml
# Instead of git-repo (includes .git metadata):
[".oh-my-zsh"]
type = "archive"
url = "https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz"
stripComponents = 1
```

Benefits:
- No `.git/` directory bloat in home directory
- Faster initial download
- Docker-friendly (smaller image layers)

Your setup already uses `archive` for oh-my-zsh — good practice.

#### Pattern 4: Archive `exclude` and `include` Patterns
**Used by:** your setup, BurnerWah, ivy

Your current oh-my-zsh exclude:
```toml
exclude = ["*/.*", "*/templates", "*/themes"]
```

BurnerWah's cherry-pick approach:
```toml
include = [
    "*/plugins/command-not-found/**",
    "*/plugins/starship/**",
    "*/plugins/zoxide/**",
]
```

Benefits:
- `include` is more explicit — you know exactly what you're getting
- `exclude` is simpler when you want "everything except..."

#### Pattern 5: Data-Driven Plugin Lists
**Used by:** ivy (for tmux plugins)

```yaml
# .chezmoidata/tmux-plugins.yaml
tmuxPlugins:
  - name: tmux-sensible
    repo: tmux-plugins/tmux-sensible
    commit: 25cb91f42d020f675bb0a2ce3fbd3a5d96119efa
```

```toml
{{ range .tmuxPlugins }}
[".config/tmux/plugins/{{ .name }}"]
type = "archive"
url = "https://github.com/{{ .repo }}/archive/{{ .commit }}.tar.gz"
stripComponents = 1
refreshPeriod = "8760h"
{{ end }}
```

Benefits:
- Plugin list is data, not template logic
- Easy to add/remove plugins
- Renovate can update commit SHAs in YAML

#### Pattern 6: Dynamic Version-Matched Completions
**Used by:** MuXiu1997

```toml
{{ $dockerVersion := output "docker" "--version" | replaceAllRegex ".*?(\\d+?\\.\\d+?\\.\\d+?).*" "$1" | trim }}
[".config/zsh/completions/_docker"]
type = "file"
url = "https://raw.githubusercontent.com/docker/cli/v{{ $dockerVersion }}/contrib/completion/zsh/_docker"
```

Benefits:
- Completions always match installed tool version
- Avoids stale completions causing errors

#### Pattern 7: Tiered Refresh Periods
**Used by:** community consensus

| Period | Use Case |
|--------|----------|
| `24h` | Daily — fast-moving tools, personal repos |
| `72h` | 3 days — actively developed tools (uv) |
| `168h` | Weekly — **default for most things** |
| `672h` | Monthly — stable tools (nvim stable) |
| `2160h` | 90 days — fonts |
| `8760h` | Yearly — pinned items updated via Renovate |

Your setup uses 72h/168h/672h — well-aligned with community norms.

#### Pattern 8: `findExecutable` + `lookPath` for Smart Install
**Used by:** jamebus

```toml
{{ if or (findExecutable "starship" (list ".local/bin")) (not (lookPath "starship")) }}
[".local/bin/starship"]
    type = "archive-file"
    ...
{{ end }}
```

Logic: Install if chezmoi already manages it in `.local/bin` OR if it's not found anywhere. Skip if a system package manager provides it.

### Externals: Recommendations

#### Adopt: Split Externals

Your single file is 253 lines and growing. Split into:

```
home/.chezmoiexternals/
├── cli-tools.toml.tmpl       # Linux binary downloads (→ remove after mise migration)
├── zsh.toml                  # oh-my-zsh, active-cheatsheet, powerlevel10k, zinit
├── tmux.toml                 # tpm, tmux-sensible
├── fonts.toml.tmpl           # MesloLGS NF (OS-conditional)
└── claude.toml               # All Claude skills and hooks
```

This is especially valuable because the mise migration (Phase 1) will remove most of `cli-tools.toml.tmpl` — you can eventually delete that entire file.

#### Adopt: GITHUB_TOKEN in refreshPeriod context

The `[github]` section in your `.chezmoi.toml.tmpl` already sets `refreshPeriod = "12h"`. This controls how often chezmoi checks GitHub for new releases. This is good — it prevents hammering GitHub's API.

#### Consider: Pinned Commits for Zsh Plugins

Currently your zsh plugins use `master.tar.gz` URLs which always get the latest. Pinning to commits would be more deterministic:

```toml
# Current:
url = "https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz"

# Pinned:
url = "https://github.com/ohmyzsh/ohmyzsh/archive/abc123def456.tar.gz"
```

Trade-off: More deterministic, but requires manual updates (or Renovate).

#### Consider Later: Data-Driven Claude Skills

Your Claude skills section has a clean loop pattern already:
```toml
{{ range $mattSkills }}
[".claude/skills/{{ . }}"]
    type = "archive"
    url = "https://github.com/mattpocock/skills/archive/main.tar.gz"
    ...
{{ end }}
```

This could move to `.chezmoidata/claude-skills.yaml` if the list grows further or if you want to add per-skill metadata (version pins, source repos).

---

## Path Management Architecture

### Current State

Your setup has 4 layers for PATH management:

```
.zshrc (line 11)          → XDG_CONFIG_HOME (early, for p10k)
.zshrc (line 26-27)       → source path-management.sh; load_paths()
  ├── paths/priority.paths.sh  → XDG vars (again), ~/.local/bin, WSL
  ├── paths/default.paths.sh   → system paths, homebrew, cargo, go, ruby
  └── paths/custom.paths.sh    → ~/.local/share/mise/bin (nearly empty)
.zshrc (line 175)         → source shell-loader.sh
  └── shell/*.sh glob     → 010-mise.sh: `mise activate` adds all tool paths
```

Issues:
- XDG defined in TWO places (`.zshrc` line 11 and `priority.paths.sh` line 7-10)
- `custom.paths.sh` is nearly empty — exists as a "slot" with one line
- `~/.cargo/bin` and `~/go/bin` in `default.paths.sh` are redundant once `mise activate` runs
- `~/.local/bin` appears in both `priority.paths.sh` and `default.paths.sh`
- No `.zshenv` — everything loads in `.zshrc` (unavailable to non-interactive shells)
- PowerShell uses a completely different approach (inline, no modularity)

### Community Approaches

#### martinemde: Simple and Flat

**Philosophy:** `.zshenv` is the single source of truth. No numbered layers, no path directory split.

```
.zshenv (XDG, core paths, env vars — available to ALL shells)
  ├── typeset -U path          # auto-dedup
  ├── XDG vars with fallbacks  # ${XDG_DATA_HOME:-$HOME/.local/share}
  ├── ~/.local/bin             # chezmoi-managed tools
  ├── ~/.cargo/bin             # Rust
  ├── ~/go/bin                 # Go
  ├── EDITOR, PAGER, LESS     # core env vars
  └── 1Password SSH agent      # conditional on darwin + not SSH'd
.zprofile
  └── source ~/.zshenv         # Fix macOS /etc/zprofile PATH reordering
.zshrc (plugins, tool integrations, UI only)
  └── tools.zsh
      ├── brew shellenv        # macOS only
      ├── mise activate zsh    # all tool paths
      ├── znap eval atuin/starship/zoxide  # cached init
      └── (no PATH manipulation here)
```

**Key pattern:** `.zprofile` re-sources `.zshenv` because macOS's `/etc/zprofile` runs between `.zshenv` and `.zprofile`, prepending Homebrew paths and pushing `~/.local/bin` down. The re-source restores priority.

**Strengths:**
- One file to understand for all PATH/env decisions
- XDG vars available to non-interactive shells (cron, scripts, editors)
- `typeset -U path` handles dedup — no manual checking needed
- `(( $+commands[tool] ))` guards — zsh-native, fast

#### sebastienrousseau: Centralized Assembly

**Philosophy:** Minimal `.zshenv`, all real PATH work in a single numbered file loaded from `.zshrc`.

```
.zshenv (minimal — just XDG + ~/.local/bin + ZDOTDIR)
  └── setopt NO_GLOBAL_RCS     # Skip macOS /etc/zprofile entirely
.zprofile (static Homebrew exports — no eval for speed)
.zshrc (numbered layer loader)
  ├── 00-core-paths.sh.tmpl    # ALL path assembly in one file
  │   └── path_prepend() helper (remove-then-prepend, idempotent)
  │   └── System → Homebrew → Languages → Local → mise shims
  ├── 05-core-safety.sh        # noclobber, pipefail
  ├── 40-fzf-defaults.sh
  ├── 50-logic-functions.sh
  └── 90-ux-aliases.sh
```

**Key pattern:** `NO_GLOBAL_RCS` sidesteps the macOS PATH reordering entirely — no need for the `.zprofile` re-source trick. `path_prepend()` is idempotent: removes existing entry then prepends, guaranteeing ordering.

**Strengths:**
- All PATH logic in one readable file (`00-core-paths.sh.tmpl`)
- Numbered layers for clear load order
- `NO_GLOBAL_RCS` is cleaner than re-sourcing `.zshenv`
- `path_prepend()` gives explicit ordering control

### Recommended Approach

Combine both: **martinemde's `.zshenv` for XDG/env** + **sebastienrousseau's numbered layers for everything else**.

#### Target Architecture

```
.zshenv.tmpl (NEW)
  ├── typeset -U path fpath manpath    # auto-dedup
  ├── XDG vars (single source of truth)
  ├── ~/.local/bin                     # chezmoi-managed tools
  ├── EDITOR, PAGER, LESS, LANG
  ├── 1Password SSH agent (darwin + not SSH)
  └── WSL: GIT_CONFIG for commit signing

.zprofile.tmpl (SIMPLIFY)
  ├── source ~/.zshenv                 # Fix macOS /etc/zprofile PATH reorder
  └── Homebrew shellenv (macOS)

.zshrc.tmpl (KEEP — minor changes)
  ├── Remove XDG_CONFIG_HOME line 11   # Now in .zshenv
  ├── Remove path-management.sh source # Replaced by .zshenv + numbered layers
  ├── Remove load_paths() call         # No longer needed
  └── source shell-loader.sh           # Keep — loads numbered layers

shell/ (SIMPLIFY numbered layers)
  ├── 000-paths.sh.tmpl               # System paths, Homebrew (replaces paths/ dir)
  ├── 010-mise.sh.tmpl                # mise activate (keep as-is)
  ├── 020-shell-tools.sh.tmpl         # fzf, zoxide, atuin (keep as-is)
  ├── 025-tmux.sh.tmpl
  ├── 030-system-tools.sh.tmpl
  ├── 040-cheatsheets.sh.tmpl
  └── 050-common-aliases.sh.tmpl
```

#### What Changes

| Current | Target | Why |
|---------|--------|-----|
| No `.zshenv` | New `dot_zshenv.tmpl` | XDG + core env available to non-interactive shells |
| XDG in `.zshrc` + `priority.paths.sh` | XDG in `.zshenv` only | Single source of truth |
| `path-management.sh` + 3 `paths/*.sh` files | One `000-paths.sh.tmpl` in `shell/` | Simpler, fits numbered layer system |
| `path_add` helper + `typeset -aU` dedup | `typeset -U path` (zsh auto-dedup) | No helper needed — zsh handles it |
| `custom.paths.sh` (nearly empty) | Deleted | Not earning its keep |
| WSL logic in `path-management.sh` | WSL logic in `.zshenv` + `000-paths.sh.tmpl` | Split: env vars in `.zshenv`, PATH filtering in `000-paths` |
| `~/.cargo/bin`, `~/go/bin` in default paths | Remove after mise migration | mise owns these runtimes |

#### What Stays the Same

- `shell-loader.sh` — glob-based numbered layer loading (already good)
- `010-mise.sh` through `050-common-aliases.sh` — keep as-is
- `typeset -aU fpath path manpath` in `.zshrc` — already good, also add to `.zshenv`
- PowerShell profile — separate approach is fine (different platform, different needs)
- `.zprofile.tmpl` — keeps `brew shellenv` eval

#### `.zshenv` Content Sketch

```bash
# XDG Base Directory Specification (single source of truth)
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"

# Prevent PATH duplicates
typeset -U path fpath manpath

# Core paths (available to non-interactive shells)
[[ -d "$HOME/.local/bin" ]] && path=("$HOME/.local/bin" $path)

# XDG-aware application configs
export CARGO_HOME="${XDG_DATA_HOME}/cargo"
export RUSTUP_HOME="${XDG_DATA_HOME}/rustup"
export GNUPGHOME="${XDG_DATA_HOME}/gnupg"
export NPM_CONFIG_USERCONFIG="${XDG_CONFIG_HOME}/npm/npmrc"
# ... other XDG overrides from priority.paths.sh

# Core environment
export EDITOR=nvim
export PAGER=less
export LESS=FRX
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

{{- if and (eq .chezmoi.os "darwin") }}
# 1Password SSH Agent (skip when SSH'd — biometric unavailable)
if [[ -z "$SSH_CONNECTION" ]]; then
  export SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
fi
{{- end }}
```

#### `000-paths.sh.tmpl` Content Sketch

```bash
# System paths
path_add "/usr/local/bin"
path_add "/usr/bin"
path_add "/bin"
path_add "/usr/sbin"
path_add "/sbin"

{{- if eq .chezmoi.os "darwin" }}
# Homebrew (added by brew shellenv in .zprofile, but ensure sbin too)
path_add "/opt/homebrew/sbin"
{{- end }}

# Language runtimes (remove after mise migration — mise owns these)
# path_add "${HOME}/.cargo/bin"
# path_add "${HOME}/go/bin"

{{- if .is_wsl }}
# WSL: Filter conflicting Windows paths
filter_windows_tool_paths
prioritize_wsl_paths
{{- end }}
```

### When to Implement

This refactor fits naturally as part of the **mise migration Phase 2** (shell-integrated tools), since:
1. Phase 1 doesn't change shell loading at all
2. Phase 2 already modifies `020-shell-tools.sh.tmpl` for fzf
3. The path cleanup (removing `~/.cargo/bin`, `~/go/bin`) depends on mise owning those runtimes
4. Creating `.zshenv` is a standalone change that can happen first

### Files to Create/Modify/Delete

| Action | File |
|--------|------|
| **Create** | `home/dot_zshenv.tmpl` |
| **Modify** | `home/dot_zprofile.tmpl` — add `source ~/.zshenv` |
| **Modify** | `home/dot_zshrc.tmpl` — remove XDG line, remove path-management source |
| **Create** | `home/dot_config/shell/000-paths.sh.tmpl` — consolidated from 3 path files |
| **Delete** | `home/dot_config/path-management.sh.tmpl` — replaced by `.zshenv` + `000-paths` |
| **Delete** | `home/dot_config/shell/paths/priority.paths.sh.tmpl` — merged into `.zshenv` |
| **Delete** | `home/dot_config/shell/paths/default.paths.sh.tmpl` — merged into `000-paths` |
| **Delete** | `home/dot_config/shell/paths/custom.paths.sh.tmpl` — empty, not needed |

---

## Shell Completions Architecture

### How Completions Work in This Setup

**Carapace** is the universal completion engine across all platforms:
- **zsh**: `source <(carapace _carapace)` in `dot_zshrc.tmpl`
- **PowerShell**: `Invoke-CachedInit -Tool 'carapace' -InitCommand { carapace _carapace }` in PS profile
- Bridges completions from zsh, fish, bash, and inshellisense

Carapace provides completions for bat, fd, ripgrep, delta, eza, jq, gh, lazygit, jj, glow, and most other CLI tools — **regardless of how they're installed**. This means migrating tools from brew/scoop to mise has no impact on completions.

### Manually Generated Completions

Generated in `configure-tools.sh` for tools where carapace doesn't cover everything:
- `gh completion -s zsh > ~/.oh-my-zsh/completions/_gh`
- `docker completion zsh > ~/.oh-my-zsh/completions/_docker`
- `topgrade --gen-completion zsh > ~/.oh-my-zsh/completions/_topgrade`
- `mise completion zsh > ~/.oh-my-zsh/completions/_mise`

### Shell Integrations

These call the binary directly and don't care about install location:
- `eval "$(zoxide init zsh)"` — works from any install method
- `eval "$(atuin init zsh)"` — works from any install method
- `source <(carapace _carapace)` — works from any install method
- `eval "$(fzf --zsh)"` — replaces brew-specific `fzf/install` script (fzf 0.48+)

### Community Approaches

- **martinemde**: Uses `znap eval` to cache tool init output (e.g., `znap eval atuin 'atuin init zsh'`)
- **sebastienrousseau**: Uses `_cached_eval` with security validation that rejects suspicious output patterns
- **shunk031**: Uses `sheldon` with `zsh-defer` for lazy loading
- **MuXiu1997**: Generates version-matched completions at apply-time using `output` in externals templates
- **Our setup**: Carapace bridges completions from all shells; manually-generated completions for a few tools; shell integrations via `eval` in shell profile scripts

---

## Patterns Considered but Not Adopted

| Pattern | Source | Why Not |
|---------|--------|---------|
| **Symlink templates for mise config** | shunk031 | Prevents OS-conditional tools in the config template |
| **Custom template delimiters** | halostatue | No conflicting `{{ }}` syntax in managed files currently |
| **Data-driven mise config from YAML** | noidilin | Adds indirection. Direct TOML template is clearer for our tool count |
| **Data-driven cross-platform packages** | noidilin, ivy | Powerful but heavy restructure. Current per-platform scripts are manageable at our scale. Revisit if adding a 4th platform |
| **Cross-platform script libraries** | noidilin | Impressive but our scripts are simple enough. Would add complexity. Revisit if scripts grow beyond ~20 lines each |
| **`modify_` scripts for mise config** | bramswenson | We don't use `mise use -g` interactively — chezmoi fully owns the config |
| **`create_` prefix for mise config** | giard-alexandre | Same — chezmoi fully owns the config |
| **Renovate for version pinning** | martinemde, ivy | Too much overhead for personal setup. `latest` is fine with weekly refresh |
| **Three-stage deferred zsh loading** | sebastienrousseau | Complex. Our p10k instant prompt + zinit deferred loading is sufficient |
| **`_cached_eval` with security validation** | sebastienrousseau | Interesting but paranoid for personal dotfiles. Would add on shared/work machines |
| **Secrets scanning post-apply** | martinemde | Good idea but not critical yet. Add when gitleaks is in mise config |
| **Dual chezmoi sources (public + private)** | shunk031 | 1Password handles our secrets. No need for a separate private repo |
| **CI-awareness in scripts** | shunk031, martinemde | We don't run chezmoi in CI currently |
| **LLM agent mode** | martinemde | Interesting — detects Claude Code via `envsense` and uses minimal prompt/pager. Worth revisiting |
| **Composable `.chezmoiignore` partials** | shunk031 | Current ignore file is readable at ~95 lines. Would add if it grows significantly |
| **Data-driven aliases with fallbacks** | ivy | Cool pattern but our alias needs are simple. Carapace handles completions |
| **`output` + `fromJson` at template time** | ivy | Powerful but fragile — template fails if the command isn't available. Prefer runtime guards |
| **Soft failure + summary reports** | noidilin | Nice UX but our scripts are simple. Would adopt if scripts grow in complexity |
| **Lock file hashing** | ivy | We use `latest` — no lock file. Covered in Scripts Pattern 2 as an option if we pin versions |
| **BATS testing for scripts** | martinemde | Impressive rigor. Would add if scripts become complex enough to warrant it |

---

## Reference Repos

### Tier 1: Most Instructive

| Repo | Highlights |
|------|-----------|
| [martinemde/dotfiles](https://github.com/martinemde/dotfiles) | 30+ aqua tools, split externals, Renovate, granular hashing, LLM agent mode, znap caching |
| [shunk031/dotfiles](https://github.com/shunk031/dotfiles) | Symlink templates, HOMEBREW_FORBIDDEN_FORMULAE, `{{ include }}` reusable scripts, zsh-defer |
| [sebastienrousseau/dotfiles](https://github.com/sebastienrousseau/dotfiles) | `_cached_eval`, three-stage loading, feature flags, glob composition, version pinning |
| [ivy/dotfiles](https://github.com/ivy/dotfiles) | ADR for aqua→github migration, data-driven tmux plugins, Renovate, archive-over-git-repo |

### Tier 2: Good Reference

| Repo | Highlights |
|------|-----------|
| [noidilin/dotfiles](https://github.com/noidilin/dotfiles) | True cross-platform (Windows+Arch+macOS), data-driven mise config from YAML |
| [MasahiroSakoda/dotfiles](https://github.com/MasahiroSakoda/dotfiles) | LSPs/debuggers via mise, `pin = true`, `lockfile = true` |
| [laurigates/dotfiles](https://github.com/laurigates/dotfiles) | 300+ line mise config, `pipx:` backend, mise tasks |
| [jamebus/dotfiles](https://github.com/jamebus) | Smart `findExecutable` guards, architecture detection, role-based conditionals |
| [BurnerWah/dotfiles](https://github.com/BurnerWah/dotfiles) | YAML split externals with JSON schema, granular oh-my-zsh includes |
| [MuXiu1997/dotfiles](https://github.com/MuXiu1997/dotfiles) | Version-matched completions, font caching, custom template helpers |

### Pattern Comparison

| Feature | Your Setup | martinemde | shunk031 | sebastienrousseau | ivy | noidilin |
|---------|-----------|------------|----------|-------------------|-----|----------|
| mise backends | core + github | core + aqua + cargo + go | core + github | core + aqua + pipx + npm | core + aqua | core + aqua |
| Externals | Single file | Split directory | Single YAML + partials | Single file | Single file + data | Split directory |
| Data files | None | None | None | `.chezmoidata.toml` | `.chezmoidata/*.yaml` | `.chezmoidata/**/*.yml` |
| Feature flags | `dev_computer` | `hosttype` (home/work) | `system` (client/server) | `features.*` | `claude.use_bedrock` | `archEnv` (wsl/native) |
| Plugin manager | zinit + oh-my-zsh | znap | sheldon | zinit | zinit | sheldon |
| Completion engine | carapace | znap eval caching | sheldon + compinit | `_cached_eval` | `output` at apply-time | carapace |
| Script ordering | 00/01/200/300 | 00 (alphabetical) | 01/02/03/50/99 | 00/10/15/20/25/30/40/50 | (flat) | 01/02/05/10/11/12/20/21/22 |
| Cross-platform | macOS+Linux+Windows | macOS+Linux | macOS+Linux | macOS+Linux | macOS+Linux | **Windows+Arch+macOS** |
| GITHUB_TOKEN | No | Yes | No | No | Yes | No |
| Script libraries | `shared_script_utils.bash` | None (inline) | `{{ include }}` from `install/` | `install/lib/` | None | `.chezmoitemplates/scripts/lib/` (bash+pwsh) |
| Hash strategy (Pattern 2) | Full config | regexFind + glob | Full script content | Composite multi-file | Config + lockfile | Full config |
| Error handling | `set -eufo pipefail` | `exit 0` on missing deps | `{{ fail }}` on bad OS | `warn_unpinned` | `|| true` | Soft failure + summary |
