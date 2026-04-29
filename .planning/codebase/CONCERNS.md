# Concerns

**Analysis Date:** 2026-04-29

A catalogue of technical debt, fragile areas, security considerations, and known issues. Each concern includes location, severity, and recommended remediation. Severity guide:

- **High** — production bug, security risk, or work blocker. Address soon.
- **Medium** — friction, drift potential, or fragility that compounds over time. Address opportunistically.
- **Low** — cosmetic / minor / latent. Address when adjacent code is touched.

---

## 1. Pwsh-side `GITHUB_TOKEN` not exported

**Severity:** High

**Location:** `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl` (no relevant line — the gap is the absence)

**Problem:** `home/dot_zshrc.tmpl:136` exports `GITHUB_TOKEN` from 1Password for zsh sessions:

```go
{{- if not .ephemeral }}
export GITHUB_TOKEN={{ onepasswordRead (printf "op://%s/GitHub PAT/token" .opVault) | trim }}
{{- end }}
```

The pwsh profile has no equivalent. Fresh pwsh sessions on Windows have `$env:GITHUB_TOKEN` unset, breaking `gh` CLI auth and rate-limiting `mise install` on Windows.

**Remediation:** Add equivalent line to pwsh profile, gated on `not .ephemeral`. Tracked as Slice 1 in the comprehensive refactor plan (`C:\Users\AndrewCl\.claude\plans\so-this-is-a-parallel-fairy.md`).

---

## 2. Unix/Windows shell layout asymmetry

**Severity:** Medium (structural)

**Location:**
- Unix modular: `home/dot_config/shell/{000-paths,010-mise,020-shell-tools,025-tmux,030-system-tools,040-cheatsheets,050-common-aliases}.sh.tmpl` + `home/dot_config/shell-loader.sh.tmpl`
- Windows monolith: `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl` (137 lines, single file)

**Problem:** Unix has clean modular shell init; Windows is a single file mixing PATH wiring, tool inits, and per-tool functions (e.g., kanata-status). Adding a new tool on Windows means editing the monolith; on Unix it means dropping a fragment. Asymmetry compounds as more shell features are added.

**Remediation:** Refactor pwsh profile into per-domain fragments (the comprehensive refactor plan adopts an aggregation-pattern variant — see Slices 1-2).

---

## 3. Mis-named `home/.chezmoitemplates/` contents

**Severity:** Medium

**Location:** `home/.chezmoitemplates/{path-functions, shell-config-functions, tool-functions}`

**Problem:** The directory `.chezmoitemplates/` has a chezmoi-specific meaning: reusable template fragments invoked via `{{ template "name" . }}` or `{{ includeTemplate "name" . }}`. These three files are *bash function libraries* sourced by `run_*` scripts at script-execution time — a different concern. They work, but the placement misleads anyone reading the repo about how the contents are used.

**Remediation:** Move to `home/.chezmoitemplates/scripts/` (a separate namespace) so the original directory can be repurposed for actual chezmoi template fragments (the planned refactor uses it for shell-fragment aggregation).

---

## 4. `tool-functions` template appears unused

**Severity:** Low (dead code)

**Location:** `home/.chezmoitemplates/tool-functions`

**Problem:** Per recent audit, no `run_*` script sources `tool-functions`. The file contains deno/pnpm install snippets that may have been superseded by mise.

**Remediation:** Delete after final-pass grep confirms zero callers. Document the removal in commit message.

---

## 5. Stale references in `docs/github-auth-architecture.md`

**Severity:** Low (documentation drift)

**Location:** `docs/github-auth-architecture.md`

**Problem:** Doc references env vars `MISE_GITHUB_TOKEN` and `GITHUB_ACCESS_TOKEN` that don't appear in the current `home/dot_zshrc.tmpl`. The doc is dated 2026-03-26 and predates a token-consolidation pass.

**Remediation:** Refresh the doc as part of Slice 6 (docs reorganization). Move to `docs/architecture/github-auth.md`.

---

## 6. No automated tests

**Severity:** Medium

**Location:** repo root — `tests/` directory does not exist.

**Problem:** No way to catch shell-syntax regressions, alias-collision regressions, or template-rendering errors before applying chezmoi. All quality assurance is manual.

**Remediation:** Tracked as Slice 5 in the refactor plan — minimal viable tests (`tests/test-aliases.sh`, `tests/test-shell-syntax.sh`).

---

## 7. 1Password authentication has no fallback

**Severity:** Medium

**Location:** Throughout templates that use `onepasswordRead`, primarily:
- `home/dot_zshrc.tmpl:136` (GITHUB_TOKEN)
- `home/dot_zshrc.tmpl:139,141` (GEMINI_API_KEY)
- `home/dot_ssh/*.tmpl` (SSH key materials)

**Problem:** If 1Password CLI is not authenticated when `chezmoi apply` runs, the apply fails with a 1Password error. Ephemeral machines bypass via `if not .ephemeral` gate, but personal/work machines with stale `op` sessions get hard failures rather than graceful fallbacks. There's no `op signin` health check before apply.

**Remediation options:**
- (Lightweight) Document the `op signin` precondition prominently.
- (Heavier) Add a `run_before_*` health check that fails fast with a friendly message.
- (Heaviest) Provide fallback flows that skip secret-bearing files when `op` is unavailable.

The lightweight option is enough for a solo user; the heaviest is over-engineered for this scale.

---

## 8. Hardcoded paths in pwsh profile

**Severity:** Low

**Location:** `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl` lines 30-32

**Problem:** WinLibs (gcc) bin path is hardcoded to a specific winget package directory:
```powershell
$winLibsBin = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
```

If WinLibs is reinstalled via a different source (scoop, manual), or the winget package ID changes, this PATH wiring breaks silently. The file does check `Test-Path "$winLibsBin\gcc.exe"` before adding, so the breakage is "PATH not extended" rather than "session crashes" — but discovery is lazy.

**Remediation:** Resolve via `where.exe gcc` once, or migrate WinLibs install to scoop/mise so the path is normalized. Lower priority — works today.

---

## 9. Tool-init order in pwsh profile is fragile

**Severity:** Medium

**Location:** `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl` lines 53-64

**Problem:** Several tools rebind keys (atuin and tv both want Ctrl+R; the profile relies on init order so atuin loads last and wins). PSReadLine must be loaded before any of them. This is documented in the inline comment — but it's encoded in source-order rather than expressed declaratively. Re-ordering by accident silently breaks Ctrl+R.

**Remediation:** Continue documenting clearly. After the planned aggregation refactor, encode init order via numbered fragment names (`020-psreadline.ps1`, `030-tv.ps1`, `040-atuin.ps1`) so order is visible in the directory listing rather than in code comments.

---

## 10. Cross-platform install script duplication

**Severity:** Low (ergonomic)

**Location:**
- `home/.chezmoiscripts/common/run_after_10-install-mise-tools.sh.tmpl` (22 lines)
- `home/.chezmoiscripts/common/run_after_10-install-mise-tools.ps1.tmpl` (30 lines)

**Problem:** Both scripts implement the same logic (bootstrap mise, get gh auth token, mise trust + install + prune) in different shells. Diverging behavior is possible if one is updated without the other.

**Remediation:** No clean fix because they target different shells with different syntax. Mitigation: keep them tightly aligned and commit them together. Test parity manually after edits.

---

## 11. Run-script numbering is ad-hoc

**Severity:** Low

**Location:** `home/.chezmoiscripts/{common,darwin,linux,windows}/run_*.{sh,ps1}.tmpl`

**Problem:** Existing scripts use numbers like `10`, `20`, `200`, `60` without consistent semantic meaning. Comparison: sebastienrousseau/dotfiles uses tier ranges (`00-09 audit`, `10-19 packages`, `25-29 languages`, `30-39 apps`, `40-49 system`, `50-59 assets`) so the prefix communicates intent.

**Remediation:** Adopt tier scheme (W1 in the refactor plan, conditional Q5).

---

## 12. WSL2 detection is heuristic

**Severity:** Low

**Location:** `home/.chezmoi.toml.tmpl` lines 26-30

**Problem:** WSL2 detection compares `.chezmoi.kernel.osrelease` against the literal string `microsoft`. Works for current Microsoft kernels; breaks if Microsoft changes the kernel string. Brittle but not currently broken.

**Remediation:** No action unless it actually breaks. Could supplement with a `/proc/version` check, but the current approach matches the chezmoi community standard.

---

## 13. No cleanup for stale `~/.config/shell/*.sh` rendered files

**Severity:** Low

**Location:** `home/dot_config/shell/`

**Problem:** When a shell fragment is removed from the source tree, chezmoi will not delete its rendered counterpart in `~/.config/shell/`. The `shell-loader.sh.tmpl` then continues to source the stale file. Same risk applies on the Windows side as the pwsh refactor lands.

**Remediation:** Use `home/.chezmoiremove.tmpl` to declare paths chezmoi should remove on apply. Or use `exact_*` directory prefix on `dot_config/shell/` so chezmoi enforces the directory contents match the source.

---

## 14. Aggregation pattern (planned) brings silent-collision risk

**Severity:** Medium (forward-looking)

**Location:** Not yet present — relevant after the aggregation refactor (Slice 1 onward).

**Problem:** The planned `.chezmoitemplates/<shell>/aliases/**/*.aliases.sh` aggregation concatenates many fragments into one bundle. Duplicate alias names overwrite silently. Sebastien's repo has a dedicated `tests/test-aliases.sh` for collision detection precisely because the pattern is footgun-prone.

**Remediation:** Land `tests/test-aliases.sh` (Slice 5) at or before the aggregation lands (Slices 1-3). Don't ship aggregation without the collision check.

---

## 15. Rendered token visibility in `~/.zshrc` (and pwsh equivalent post-refactor)

**Severity:** Low (acceptable for local user)

**Location:** `~/.zshrc` after `chezmoi apply` (the rendered output of `home/dot_zshrc.tmpl`)

**Problem:** `onepasswordRead` resolves to a literal token string in the rendered file. The rendered `~/.zshrc` therefore contains the GitHub PAT in plaintext on disk. Anyone with read access to the user's home directory can read it. Same applies to the planned pwsh secret fragment.

**Mitigation accepted:** This is consistent with the standard chezmoi-1Password integration pattern and the file is in `$HOME` (already user-restricted). The trade-off is conscious: chezmoi-side templating in exchange for zero-runtime-dependency secret injection. If higher security is required, switch to runtime resolution (`eval "$(op read ...)"` in the shell init) but accept the dependency on `op` being authenticated for every shell launch.

---

## 16. Junction-vs-symlink inconsistency on Windows

**Severity:** Low

**Location:** `home/.chezmoiscripts/common/` (Claude memory backup/restore scripts)

**Problem:** The repo uses junctions on Windows for `.claude/memory` to avoid requiring Developer Mode (which is needed for true symlinks). Junctions behave like symlinks for most purposes but differ for cross-volume targets. If a future feature needs symlinks specifically, this needs explicit handling.

**Remediation:** Document the choice (current commit messages do mention it). Audit any future `home/.chezmoiscripts/windows/` script that creates a link to confirm it follows the same junction approach.

---

## Summary table

| # | Concern | Severity | Tracked in refactor? |
|---|---------|----------|----------------------|
| 1 | Pwsh GITHUB_TOKEN missing | High | Yes (Slice 1) |
| 2 | Unix/Windows shell asymmetry | Medium | Yes (Slices 1-3) |
| 3 | Mis-placed `.chezmoitemplates/` contents | Medium | Yes (Slice 8) |
| 4 | `tool-functions` unused | Low | Yes (Slice 8) |
| 5 | Stale auth doc | Low | Yes (Slice 6) |
| 6 | No automated tests | Medium | Yes (Slice 5) |
| 7 | 1Password no fallback | Medium | No |
| 8 | WinLibs hardcoded path | Low | No |
| 9 | Pwsh tool-init order fragile | Medium | Partially (numbering helps) |
| 10 | Cross-platform install script duplication | Low | No |
| 11 | Run-script numbering ad-hoc | Low | Yes (W1 / conditional Q5) |
| 12 | WSL2 detection heuristic | Low | No |
| 13 | No stale-file cleanup | Low | No |
| 14 | Aggregation collision risk | Medium (forward) | Yes (Slice 5 + design) |
| 15 | Rendered token in $HOME | Low (accepted) | No |
| 16 | Junction-vs-symlink on Windows | Low | No |

---

*Concerns analysis: 2026-04-29*
