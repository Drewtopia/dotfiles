# Mise Migration Plan: Consolidating Tool Installation

> **Status:** Planning
> **Date:** 2026-03-25
> **Last Updated:** 2026-03-25 (added session notes, script cleanup findings)
> **Goal:** Move cross-platform CLI tools from Scoop/Brew/chezmoi-externals into mise, reducing duplication and simplifying the setup.
> **Companion:** See `chezmoi-patterns-guide.md` for chezmoi template, script, and externals patterns referenced in this plan.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Research & Inspiration](#research--inspiration)
- [Migration Strategy](#migration-strategy)
- [Phase 1: Pure CLI Tools](#phase-1-pure-cli-tools-no-shell-integration)
- [Phase 2: Shell-Integrated Tools](#phase-2-shell-integrated-tools)
- [Phase 3: Cleanup](#phase-3-cleanup)
- [Backend Decision Guide](#backend-decision-guide)
- [Adopted Patterns](#adopted-patterns)
- [Files to Modify](#files-to-modify)
- [Risks & Mitigations](#risks--mitigations)
- [Reference Repos](#reference-repos)

---

## Session Notes (2026-03-25)

### Key Finding: mise installer already runs `mise install --yes`

When mise is installed via `curl https://mise.run | sh`, the installer automatically runs `mise install --yes` after installing the binary. This means the explicit `mise install` call in the `install-packages` scripts (darwin, linux, windows) is redundant on first install.

**Implication:** Don't create separate `install-mise` scripts. The current pattern of installing mise inside `install-packages` is fine — just remove the redundant `mise install` call after it. The dedicated `200-install-mise-tools` scripts still serve their purpose: re-running `mise install` when `config.toml.tmpl` changes.

### Script Overlap Analysis

The initial concern was "scripts doing too much." After analysis, the conclusion is that **the mise migration itself solves the bloat problem**. As tools move from brew/scoop/apt/chezmoi-externals into mise across Phases 1–3, the `install-packages` scripts naturally shrink to only managing things that *must* stay in platform package managers (system deps, GUI apps, fonts, Quick Look plugins).

Restructuring the scripts into many smaller files (e.g., separate `install-zoxide.sh`, `install-atuin.sh`) would be premature — those tools are moving to mise anyway.

### Changes Already Made

The following changes were made to `darwin/run_onchange_before_install-packages.sh.tmpl` during this session:

- **Added** `glance-chamburr` cask — Quick Look plugin for markdown, source code, archives, Jupyter notebooks, TSV
- **Kept** `qlmarkdown` — deprecated but still works, needed for specific markdown preview features
- **Kept** `syntax-highlight` — source code Quick Look previews (complements Glance)
- **Kept** `qlvideo` — video Quick Look previews (Glance doesn't handle video)
- **Added** `no_quarantine` brew bundle args for `glance-chamburr` and `qlmarkdown` — both need quarantine removal to function as Quick Look extensions

The brew bundle template now conditionally generates `args: { no_quarantine: true }` for these casks:
```go
{{ if or (eq . "glance-chamburr") (eq . "qlmarkdown") -}}
cask "{{ . }}", args: { no_quarantine: true }
{{ else -}}
cask "{{ . }}"
{{ end -}}
```

### Remaining Script Cleanup (Pre-Migration)

Before starting Phase 1, the only script change needed is removing the redundant `mise install` from the `install-packages` scripts on all three platforms. The `200-install-mise-tools` scripts handle this.

| Platform | File | Change |
|----------|------|--------|
| macOS | `darwin/run_onchange_before_install-packages.sh.tmpl` | Remove `mise install` block (lines 123-124), keep `curl https://mise.run \| sh` |
| Linux | `linux/run_onchange_before_install-packages.sh.tmpl` | Remove `mise install` block, keep mise curl install |
| Windows | `windows/run_onchange_before_install-packages.ps1.tmpl` | Remove `mise install` block, keep mise irm install |

The `shared_script_utils.bash` template is unused by any script. Decision deferred — it's harmless but adds clutter. Can be removed during Phase 3 cleanup or wired in if scripts grow in complexity.

---

## Problem Statement

The same CLI tool is currently installed via **3 different methods** depending on platform:

| Tool | macOS | Windows | Linux |
|------|-------|---------|-------|
| bat | brew | scoop | apt |
| ripgrep | brew | scoop | apt |
| fd | brew | scoop | apt |
| delta | brew | scoop | chezmoi external |
| lazygit | brew | scoop | chezmoi external |
| eza | brew | scoop | chezmoi external |
| glow | brew | scoop | chezmoi external |
| jq | brew | scoop | apt |
| gh | brew | scoop | apt |
| zoxide | brew | scoop | curl script |
| fzf | brew | scoop | apt |
| carapace | brew | scoop | chezmoi external |
| jj | brew | scoop | chezmoi external |
| age | brew | - | chezmoi external |
| atuin | brew | winget | curl script |

This means maintaining: `Brewfile list` + `Scoop packages array` + `apt packages list` + `chezmoi externals` + `curl install commands` — all for the same tools.

**mise can replace all of these with a single `config.toml.tmpl`.**

---

## Research & Inspiration

### Community Consensus

The emerging pattern from well-maintained dotfiles repos is a **three-layer approach**:

| Layer | Tool | Manages |
|-------|------|---------|
| OS package manager | brew/scoop/apt | System deps, GUI apps, fonts, things needing OS integration |
| mise | mise | Language runtimes + standalone CLI binaries |
| chezmoi | chezmoi | Dotfiles, templates, bootstrapping mise, shell completions |

### Key Repos Studied

See `chezmoi-patterns-guide.md` Reference Repos section for the full list with comparison table. The most relevant to this migration:

- **martinemde/dotfiles** — 30+ aqua tools, the closest model for our Phase 1 migration
- **noidilin/dotfiles** — True cross-platform (Windows + Arch + macOS), closest to our platform matrix
- **ivy/dotfiles** — ADR explaining aqua→github backend migration, useful if we hit aqua issues

### Backend Recommendation from mise docs

> "aqua is the ideal backend to use for new tools since they don't require plugins, they work on Windows, and they offer security features in addition to checksums."

The `aqua:` backend is preferred when the tool exists in the aqua registry. Fallback to `github:` for tools not in aqua.

---

## Migration Strategy

### Guiding Principles

1. **Migrate incrementally** — pure CLI tools first, shell-integrated tools second
2. **aqua backend preferred** — checksum verification, Windows support, curated registry
3. **Keep brew for GUI apps and macOS system deps** — mise can't replace casks
4. **Keep apt for Linux system packages** — needed before mise exists
5. **Keep scoop for Windows fonts and neovim** — mise doesn't handle fonts
6. **Test each phase** before proceeding to the next
7. **Set GITHUB_TOKEN** during `mise install` to avoid API rate limits

### What NOT to migrate

| Tool | Reason to keep in platform manager |
|------|------------------------------------|
| git, curl, wget | System-level, needed before mise exists |
| gnupg, git-lfs, xz | System dependencies |
| tmux, zsh, shellcheck | Unix-only, need system libraries |
| neovim | AppImage on Linux, Scoop on Windows — platform quirks |
| ffmpeg, pkg-config | Build dependencies |
| All brew casks | GUI apps — mise doesn't manage these |
| All apt core packages | System packages on Linux servers |
| 1password-cli | Needs system integration (browser extension) |
| fonts | Scoop/brew/font dirs — mise doesn't handle fonts |
| kanata | Needs platform-specific system setup beyond just the binary |

---

## Phase 1: Pure CLI Tools (No Shell Integration)

These tools are standalone binaries with no `eval "$(tool init shell)"` required.
Carapace already provides completions for all of them.

### Tools to Move

| Tool | Current install methods | mise backend | aqua registry? |
|------|------------------------|-------------|----------------|
| bat | brew + scoop + apt | `aqua:sharkdp/bat` | Yes |
| delta | brew + scoop + chezmoi ext | `aqua:dandavison/delta` | Yes |
| eza | brew + scoop + chezmoi ext | `github:eza-community/eza` | No |
| fd | brew + scoop + apt | `aqua:sharkdp/fd` | Yes |
| glow | brew + scoop + chezmoi ext | `aqua:charmbracelet/glow` | Yes |
| jq | brew + scoop + apt | `aqua:jqlang/jq` | Yes |
| lazygit | brew + scoop + chezmoi ext | `aqua:jesseduffield/lazygit` | Yes |
| ripgrep | brew + scoop + apt | `aqua:BurntSushi/ripgrep` | Yes |
| gh | brew + scoop + apt | `aqua:cli/cli` | Yes |
| age | brew + chezmoi ext | `aqua:FiloSottile/age` | Yes |
| croc | chezmoi ext | `aqua:schollz/croc` | Yes |
| gdu | brew + chezmoi ext | `aqua:dundee/gdu` | Yes |
| yt-dlp | brew + chezmoi ext | `github:yt-dlp/yt-dlp` | No |
| jj | brew + scoop + chezmoi ext | `aqua:jj-vcs/jj` | Yes |
| jless | brew + chezmoi ext | (keep brew/ext — no Windows binary) | N/A |
| golangci-lint | brew + chezmoi ext | `aqua:golangci/golangci-lint` | Yes |

### Changes Required

**`home/dot_config/mise/config.toml.tmpl`** — Add tools:
```toml
[tools]
# Language runtimes (core backend)
node = "latest"
pnpm = "latest"
deno = "latest"
bun = "latest"
python = "3.12"
uv = "latest"
go = "latest"
rust = "latest"

# mise ecosystem tools (core backend)
usage = "latest"
fnox = "latest"

# CLI tools (aqua backend — checksums verified)
"aqua:BurntSushi/ripgrep" = "latest"
"aqua:charmbracelet/glow" = "latest"
"aqua:cli/cli" = "latest"
"aqua:dandavison/delta" = "latest"
"aqua:dundee/gdu" = "latest"
"aqua:FiloSottile/age" = "latest"
"aqua:golangci/golangci-lint" = "latest"
"aqua:jesseduffield/lazygit" = "latest"
"aqua:jj-vcs/jj" = "latest"
"aqua:jqlang/jq" = "latest"
"aqua:schollz/croc" = "latest"
"aqua:sharkdp/bat" = "latest"
"aqua:sharkdp/fd" = "latest"

# CLI tools (github backend — not in aqua registry)
"github:eza-community/eza" = "latest"
"github:iffse/pay-respects" = "latest"
"github:yt-dlp/yt-dlp" = "latest"
```

**`home/.chezmoiscripts/darwin/run_onchange_before_install-packages.sh.tmpl`** — Remove from `$brews`:
```
bat, delta (git-delta), eza, fd, gdu, gh, glow, golangci-lint, jj, jless, jq, lazygit, ripgrep, yt-dlp, age
```

Keep in `$brews`: `atuin, btop, carapace, curl, dockutil, ffmpeg, fzf, git, git-lfs, gnu-units, gnupg, kanata, mas, pkg-config, shellcheck, tmux, wget, xz, zoxide` (atuin, carapace, fzf, zoxide move to mise in Phase 2)

**`home/.chezmoiscripts/windows/run_onchange_before_01-install-scoop.ps1.tmpl`** — Remove from `$scoopPackages`:
```
bat, delta, eza, fd, gh, glow, jj, jq, lazygit, ripgrep
```

Keep in `$scoopPackages`: `carapace-bin, fzf, kanata, Meslo-NF, neovim, zoxide` (carapace, fzf, zoxide move to mise in Phase 2)

**`home/.chezmoiscripts/linux/run_onchange_before_install-packages.sh.tmpl`** — Remove from `$packages`:
```
bat, fd-find, gh, jq, ripgrep
```

Keep in `$packages`: `curl, ffmpeg, fzf, git, git-lfs, gnupg, neovim, pkg-config, shellcheck, tmux, units, unzip, wget, xz-utils, zsh`

Remove the standalone curl installs for zoxide (line 62-63).

**`home/.chezmoiexternal.toml.tmpl`** — Remove the Linux-only binary downloads for:
```
age, age-keygen, croc, eza, gdu, glow, golangci-lint, jless, delta, lazygit, yt-dlp, jj, carapace
```

Keep: `cue` (not moving to mise), `nvim` (platform quirks), `uv` (already in mise but Linux external is a fallback)

### Verification

After making changes:
```bash
# On each platform:
chezmoi apply
mise install
# Verify each tool works:
bat --version && fd --version && rg --version && delta --version
eza --version && glow --version && jq --version && lazygit --version
gh --version && age --version && jj --version && gdu --version
```

---

## Phase 2: Shell-Integrated Tools

These tools have `eval "$(tool init shell)"` patterns in shell profiles.
They work from any install location — the shell integration just calls the binary.

### Tools to Move

| Tool | Shell integration | Current install | mise backend | Risk |
|------|-------------------|-----------------|-------------|------|
| zoxide | `eval "$(zoxide init zsh)"` | brew + scoop + curl | `aqua:ajeetdsouza/zoxide` | Low — integration is binary-location-agnostic |
| atuin | `eval "$(atuin init zsh)"` | brew + winget + curl | `aqua:atuinsh/atuin` | Low — same reason |
| carapace | `source <(carapace _carapace)` | brew + scoop + chezmoi ext | `aqua:carapace-sh/carapace-bin` | Low — same reason |
| fzf | `fzf/install` script + `~/.fzf.zsh` | brew + scoop + apt | `aqua:junegunn/fzf` | **Medium** — brew's `fzf/install` script won't exist |

### fzf Migration Details

The `configure-tools.sh` script currently runs brew's fzf install script:
```bash
/opt/homebrew/opt/fzf/install --key-bindings --completion --no-update-rc
```

With mise, fzf provides built-in shell integration (since fzf 0.48+):
```bash
# Replace the platform-specific fzf/install calls with:
eval "$(fzf --zsh)"    # for zsh
eval "$(fzf --bash)"   # for bash
```

This works regardless of install location. Update `020-shell-tools.sh.tmpl` accordingly.

### Changes Required

**`home/dot_config/mise/config.toml.tmpl`** — Add:
```toml
"aqua:ajeetdsouza/zoxide" = "latest"
"aqua:atuinsh/atuin" = "latest"
"aqua:carapace-sh/carapace-bin" = "latest"
"aqua:junegunn/fzf" = "latest"
```

**Remove from brew/scoop/apt/chezmoi-ext/curl**: `zoxide`, `atuin`, `fzf`, `carapace`

**`home/dot_config/shell/020-shell-tools.sh.tmpl`** — Replace fzf setup:
```bash
# Before (platform-specific):
if command -v fzf >/dev/null 2>&1; then
    [[ -f ~/.fzf.zsh ]] && source ~/.fzf.zsh
    ...
fi

# After (universal):
if command -v fzf >/dev/null 2>&1; then
    eval "$(fzf --zsh)"
fi
```

**`home/.chezmoiscripts/run_onchange_after_configure-tools.sh.tmpl`** — Remove the entire fzf `install` script section (lines 10-24).

**`home/.chezmoiscripts/windows/run_onchange_before_install-packages.ps1.tmpl`** — Remove Atuin winget install block.

**`home/.chezmoiscripts/linux/run_onchange_before_install-packages.sh.tmpl`** — Remove Atuin curl install block and zoxide curl install.

### Path Management Refactor

Phase 2 is the natural time to refactor path management, since shell loading is already being modified for fzf. See `chezmoi-patterns-guide.md` Path Management Architecture section for the full plan. Summary:

1. Create `dot_zshenv.tmpl` — XDG vars + core env (single source of truth)
2. Add `source ~/.zshenv` to `dot_zprofile.tmpl` (macOS PATH fix)
3. Create `shell/000-paths.sh.tmpl` — consolidate 3 path files into 1
4. Remove `path-management.sh.tmpl` and `paths/` directory
5. Remove `~/.cargo/bin` and `~/go/bin` from paths (mise owns them now)

### Verification

```bash
# Test shell integrations still work:
# zoxide: cd to a directory, then `z` back to it
# atuin: press Ctrl+R for history search
# fzf: press Ctrl+T for file picker, Ctrl+R for fzf history
# carapace: type `git <tab>` for completions

# Test paths are correct:
# which bat fd rg delta jq gh lazygit  (should all point to mise paths)
# echo $XDG_CONFIG_HOME  (should be set in non-interactive: ssh host 'echo $XDG_CONFIG_HOME')
```

---

## Phase 3: Cleanup

### Remove Dead Code

1. **chezmoi externals** (`home/.chezmoiexternal.toml.tmpl`):
   - Remove all `[".local/bin/<tool>"]` entries for tools now in mise
   - Keep: oh-my-zsh, powerlevel10k, zinit, tmux plugins, claude skills, fonts, cue, nvim

2. **Linux apt packages** — Consider removing `age` from apt list (now in mise)

3. **`home/.chezmoiscripts/run_onchange_after_configure-tools.sh.tmpl`**:
   - Remove fzf install script block
   - Keep: gh aliases, pnpm config, completion generation

4. **Old mise backend** — Clean up any leftover `ubi:` install:
   ```bash
   mise uninstall ubi:iffse/pay-respects
   ```

### Update mise install scripts

Apply patterns from `chezmoi-patterns-guide.md` (Scripts Patterns 3, 4, 13) to all three `run_onchange_after_200-install-mise-tools` scripts:

**Unix (darwin + linux):**
```bash
if command -v gh >/dev/null 2>&1; then
    export GITHUB_TOKEN="$(gh auth token 2>/dev/null)" || true
fi
mise trust --all 2>/dev/null || true
mise install --yes
mise prune --yes 2>/dev/null || true
```

**Windows (PowerShell):**
```powershell
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $env:GITHUB_TOKEN = (gh auth token 2>$null)
}
mise trust --all 2>$null
mise install --yes
mise prune --yes 2>$null
```

Changes:
- **GITHUB_TOKEN** — prevents GitHub API rate limits when installing many aqua/github tools
- **`mise trust --all`** — prevents interactive trust prompt from hanging non-interactive scripts
- **`mise prune --yes`** — cleans up old tool versions after updates

---

## Backend Decision Guide

Use this when adding new tools to mise:

```
Is it a language runtime (node, python, go, rust)?
  → Use core backend (no prefix): `node = "latest"`

Is it in the mise registry as a core tool?
  → Use core backend: `usage = "latest"`

Is it in the aqua registry? (check: `mise registry | grep aqua:toolname`)
  → Use aqua backend: `"aqua:owner/repo" = "latest"`
  → Benefits: checksum verification, Windows support, curated

Is it on GitHub with release binaries?
  → Use github backend: `"github:owner/repo" = "latest"`
  → Benefits: zero config, direct from source

Does it need compilation from source?
  → Use cargo/go backend: `"cargo:crate-name"` or `"go:module/path"`

Is it an npm/pip package?
  → Use npm/pipx backend: `"npm:package"` or `"pipx:package"`
```

---

## Adopted Patterns

The following patterns from the community support this migration. See `chezmoi-patterns-guide.md` for full descriptions, code examples, and rationale.

### Patterns to Apply During Migration

| Pattern | Guide Reference | When to Apply |
|---------|----------------|---------------|
| GITHUB_TOKEN via `gh auth token` | Scripts Pattern 3 | Phase 3 — mise install scripts |
| `mise trust --all` before install | Scripts Pattern 4 | Phase 3 — mise install scripts |
| `mise prune --yes` after install | Scripts Pattern 13 | Phase 3 — mise install scripts |
| `HOMEBREW_FORBIDDEN_FORMULAE` | Template Pattern 6 | Phase 1 — after removing tools from brew |
| OS-conditional mise tools | Template Pattern 3 | Phase 1 — if some tools are macOS/Linux only |
| Split externals directory | Externals Pattern 1 | Phase 3 — split externals after removing CLI binary entries |
| Feature flags via `.chezmoidata.toml` | Template Pattern 2 | Later — if tool groups grow |

### Shell Completions Impact

**No changes needed for completions.** Carapace handles completions for all CLI tools regardless of install method. Shell integrations (`zoxide init`, `atuin init`, `carapace _carapace`) call the binary directly and don't care about install location.

The only change: fzf's brew-specific `fzf/install` script won't exist after moving to mise. Replace with `eval "$(fzf --zsh)"` in Phase 2 (see Phase 2 details above).

See `chezmoi-patterns-guide.md` Shell Completions section for full architectural details.

### Patterns Evaluated but Not Adopting

See `chezmoi-patterns-guide.md` "Patterns Considered but Not Adopted" for the full list with rationale.

---

## Files to Modify

### Pre-Migration Cleanup

| File | Action |
|------|--------|
| `home/.chezmoiscripts/darwin/run_onchange_before_install-packages.sh.tmpl` | Remove redundant `mise install` call (installer does it) ✅ Quick Look cask changes done |
| `home/.chezmoiscripts/linux/run_onchange_before_install-packages.sh.tmpl` | Remove redundant `mise install` call |
| `home/.chezmoiscripts/windows/run_onchange_before_install-packages.ps1.tmpl` | Remove redundant `mise install` call |

### Phase 1

| File | Action |
|------|--------|
| `home/dot_config/mise/config.toml.tmpl` | Add ~15 aqua/github tools |
| `home/.chezmoiscripts/darwin/run_onchange_before_install-packages.sh.tmpl` | Remove ~15 brews |
| `home/.chezmoiscripts/windows/run_onchange_before_01-install-scoop.ps1.tmpl` | Remove ~10 scoop packages |
| `home/.chezmoiscripts/linux/run_onchange_before_install-packages.sh.tmpl` | Remove ~5 apt packages |
| `home/.chezmoiexternal.toml.tmpl` | Remove ~13 Linux binary downloads |

### Phase 2

| File | Action |
|------|--------|
| `home/dot_config/mise/config.toml.tmpl` | Add zoxide, atuin, carapace, fzf |
| `home/dot_config/shell/020-shell-tools.sh.tmpl` | Update fzf integration |
| `home/dot_zshenv.tmpl` | **Create** — XDG vars, core env, `~/.local/bin` |
| `home/dot_zprofile.tmpl` | Add `source ~/.zshenv` for macOS PATH fix |
| `home/dot_zshrc.tmpl` | Remove XDG line, remove `path-management.sh` source |
| `home/dot_config/shell/000-paths.sh.tmpl` | **Create** — consolidated system paths |
| `home/dot_config/path-management.sh.tmpl` | **Delete** — replaced by `.zshenv` + `000-paths` |
| `home/dot_config/shell/paths/` | **Delete** — 3 files merged into `.zshenv` + `000-paths` |
| `home/.chezmoiscripts/run_onchange_after_configure-tools.sh.tmpl` | Remove fzf install script block |
| `home/.chezmoiscripts/windows/run_onchange_before_install-packages.ps1.tmpl` | Remove atuin winget |
| `home/.chezmoiscripts/linux/run_onchange_before_install-packages.sh.tmpl` | Remove atuin curl, zoxide curl |
| Brew/scoop/apt lists | Remove zoxide, atuin, carapace, fzf |

### Phase 3

| File | Action |
|------|--------|
| `home/.chezmoiscripts/*/run_onchange_after_200-install-mise-tools.*` | Add GITHUB_TOKEN, `mise trust --all`, `mise prune --yes` (all 3 platforms) |
| `home/.chezmoiscripts/run_onchange_after_configure-tools.sh.tmpl` | Remove fzf install block (if not done in Phase 2), update hash trigger |
| `home/.chezmoiexternal.toml.tmpl` | Remove Linux binary downloads for tools now in mise |
| `home/.chezmoitemplates/shared_script_utils.bash` | **Decision:** remove (unused) or wire in if scripts warrant it |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub API rate limits during `mise install` with many aqua/github tools | Install fails partway | Set `GITHUB_TOKEN=$(gh auth token)` before install |
| aqua registry lag (new tool version not yet registered) | Stuck on old version | Can pin `github:` backend as fallback for specific tools |
| mise not installed yet on fresh system | No tools available | Bootstrap scripts install mise first, before `mise install` |
| Tool binary name differs between backends | Scripts break | Test all tools after migration |
| Windows-specific aqua issues | Tools fail to install on Windows | Test on Windows first since it's the primary dev machine |
| Shell startup slower with many mise-managed tools | UX degradation | mise shims are fast (8ms). Use `mise activate` for shim-free mode if needed |

---

## Reference Repos

See `chezmoi-patterns-guide.md` Reference Repos section for the full list, tiered by relevance, with a detailed comparison table.
