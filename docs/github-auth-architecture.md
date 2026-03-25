# GitHub Authentication & 1Password Architecture

> **Date:** 2026-03-26
> **Purpose:** Document how GitHub auth, SSH keys, and 1Password secrets work across machines.
> **Companion:** See `mise-migration-plan.md` for tool installation, `chezmoi-patterns-guide.md` for patterns.

## Overview

Three machines, two 1Password vaults, multiple auth mechanisms:

| Machine | OS | Vault | `work` | `personal` |
|---------|-----|-------|--------|-----------|
| Andrews MacBook Pro | macOS | Private | false | true |
| VEC work PC | Windows + WSL2 | Employee | true | false |
| Personal desktop | Windows | Private | false | true |

## Authentication Mechanisms

### 1. SSH Keys (git push/pull over SSH)

**How it works:** 1Password SSH Agent provides keys. The agent runs on the host OS and serves keys to `ssh` when git operations need them.

**Current setup:** SSH keys are pulled from 1Password during `chezmoi apply` and written to `~/.ssh/`:

```
dot_ssh/id_ed25519.pub.tmpl      → op://Employee/SSH Key/public key    (work)
                                  → op://Private/SSH Key/public key     (personal)
dot_ssh/private_id_ed25519.tmpl  → op://Employee/SSH Key/private key   (work)
                                  → op://Private/SSH Key/private key    (personal)
dot_ssh/id_rsa.pub.tmpl          → op://Employee/SSH Key - RSA/...     (work, for Azure DevOps)
                                  → op://Private/SSH Key - RSA/...      (personal)
```

**Status:** Working correctly. Uses `$opVault`-style branching (work/personal conditional).

**One key per vault identity** — all machines with access to a vault share the same key. No per-machine keys needed.

### 2. `gh` CLI Auth (GitHub API via CLI)

**How it works:** `gh auth login` stores an OAuth token in `~/.config/gh/hosts.yml`. This is per-machine, per-user.

**Current setup:** Manual `gh auth login` on each machine. Not managed by chezmoi.

**Used for:**
- `gh pr create`, `gh issue view`, etc.
- `gh auth token` → provides `GITHUB_TOKEN` for mise install scripts (see migration plan Phase 3)
- `git credential helper` via `gh auth git-credential` (line 125-131 of `git/config.tmpl`)

**Status:** Works. `lookPath "gh"` dynamically resolves the binary path on each `chezmoi apply`.

### 3. GitHub Personal Access Tokens (PATs)

**How it works:** Fine-grained tokens created at github.com/settings/tokens. Stored in 1Password, referenced in templates.

**Current setup (dot_zshrc.tmpl lines 135-141):**

```go
{{ if and (not .ephemeral) (not .work) -}}
export GITHUB_ACCESS_TOKEN={{ onepasswordRead "op://Private/GitHub Metadata Read-Only Access Token/token" | trim }}
export MISE_GITHUB_TOKEN={{ onepasswordRead "op://Private/GitHub mise PAT/token" | trim }}
export GEMINI_API_KEY={{ onepasswordRead "op://Private/Gemini API Key/token" | trim }}
{{ else if .work -}}
export GEMINI_API_KEY={{ onepasswordRead "op://Employee/Gemini API Key/password" | trim }}
{{ end -}}
```

**Gaps identified:**

| Token | Personal machines | Work machines | Gap |
|-------|------------------|---------------|-----|
| `GITHUB_ACCESS_TOKEN` | Private vault | **Missing** | Work has no GitHub token for shell scripts |
| `MISE_GITHUB_TOKEN` | Private vault | **Missing** | Work hits GitHub API rate limits during `mise install` |
| `GEMINI_API_KEY` | Private vault (`/token`) | Employee vault (`/password`) | Works but field name inconsistent |

### 4. chezmoi `[github] accessToken` (optional)

**How it works:** chezmoi uses this for authenticated GitHub API calls when resolving `gitHubLatestReleaseAssetURL` in `.chezmoiexternal.toml.tmpl`. Without it, unauthenticated rate limit is 60 requests/hour.

**Current setup:** Not configured (was briefly added then removed — see Session Notes below).

**When you'd need it:** Only if `chezmoi apply` hits GitHub rate limits from many externals using `gitHubLatestReleaseAssetURL`. Currently only `cue` and `nvim` use this on Linux, so rate limits are unlikely.

**If added, should look like:**
```toml
[github]
    refreshPeriod = "12h"
{{- if not $ephemeral }}
    accessToken = {{ onepasswordRead (printf "op://%s/GitHub PAT - chezmoi/token" $opVault) | trim | quote }}
{{- end }}
```

This uses `$opVault` to read from the correct vault per machine. Requires a 1Password item named "GitHub PAT - chezmoi" with a "token" field in both Private and Employee vaults.

## Git Credential Flow

How `git push` authenticates on each platform:

### macOS (personal)
```
git push → SSH (1Password SSH Agent) → op://Private/SSH Key
           OR
           HTTPS → osxkeychain credential helper
           HTTPS to github.com → gh auth git-credential
```

### Windows (work)
```
git push → SSH (1Password SSH Agent) → op://Employee/SSH Key
           OR
           HTTPS to github.com → gh auth git-credential
```

### WSL2 (work)
```
git push → SSH (needs own key or 1Password interop)
           HTTPS to github.com → gh auth git-credential (native gh via mise)
           HTTPS to dev.azure.com → git-credential-manager.exe via interop
```

**`git/config.tmpl` credential setup:**

```
# All platforms with gh installed (line 125-131):
[credential "https://github.com"]
    helper = !"<gh binary path>" auth git-credential

# macOS only (line 133-135):
[credential]
    helper = osxkeychain

# WSL2 work only (line 146-151):
[credential]
    helper = /mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe
[credential "https://dev.azure.com"]
    useHttpPath = true
```

The `gh auth git-credential` path is resolved dynamically via `lookPath "gh"` at `chezmoi apply` time. When gh moves from scoop to mise, the path updates automatically on next apply.

## Action Items

### Quick Wins (fix now)

1. **Add `MISE_GITHUB_TOKEN` for work machines** — create a GitHub PAT in Employee vault, add to `.zshrc.tmpl`:
   ```go
   {{ else if .work -}}
   export MISE_GITHUB_TOKEN={{ onepasswordRead "op://Employee/GitHub mise PAT/token" | trim }}
   export GEMINI_API_KEY={{ onepasswordRead "op://Employee/Gemini API Key/password" | trim }}
   {{ end -}}
   ```

2. **Standardize 1Password field names** — Gemini uses `token` in Private but `password` in Employee. Pick one.

### Consider Later

3. **Add chezmoi `[github] accessToken`** — only needed if rate-limited during `chezmoi apply`. Use `$opVault` pattern.

4. **WSL2 SSH strategy** — with interop ON (`appendWindowsPath=false`), two options:
   - Use 1Password SSH Agent on Windows side via `SSH_AUTH_SOCK` pointing to Windows pipe (requires interop)
   - Install native `op` on WSL and use 1Password SSH Agent there (independent of interop)

5. **Consolidate GitHub PATs** — currently there are multiple PATs across vaults:
   - `GitHub Metadata Read-Only Access Token` (Private) → `GITHUB_ACCESS_TOKEN`
   - `GitHub mise PAT` (Private) → `MISE_GITHUB_TOKEN`
   - `Homebrew GitHub API Token` (Private) → `HOMEBREW_GITHUB_API_TOKEN`

   These could potentially be one PAT with read-only public repo scope, stored consistently in both vaults.

## Session Notes

### 2026-03-26: accessToken incident

A `[github] accessToken` line was added to `.chezmoi.toml.tmpl` in commit `cebff08` that:
- Hardcoded `op://Private/...` instead of using `$opVault`
- Referenced an item name ("GitHub Metadata Read-Only Access Token") that didn't exist
- Wasn't gated on work/personal — ran for all non-ephemeral machines

This caused `chezmoi init --prompt` to fail on the work machine. The line was removed in the same session. If re-added, must use the `$opVault` pattern shown above.

## 1Password Reference Map

Complete inventory of all 1Password references in chezmoi templates:

| File | Vault | Item | Field | Condition |
|------|-------|------|-------|-----------|
| `dot_ssh/id_ed25519.pub.tmpl` | Employee | SSH Key | public key | work |
| `dot_ssh/id_ed25519.pub.tmpl` | Private | SSH Key | public key | personal |
| `dot_ssh/private_id_ed25519.tmpl` | Employee | SSH Key | private key | work |
| `dot_ssh/private_id_ed25519.tmpl` | Private | SSH Key | private key | personal |
| `dot_ssh/id_rsa.pub.tmpl` | Employee | SSH Key - RSA | public key | work |
| `dot_ssh/id_rsa.pub.tmpl` | Private | SSH Key - RSA | public key | personal |
| `dot_ssh/private_id_rsa.tmpl` | Employee | SSH Key - RSA | private key | work |
| `dot_ssh/private_id_rsa.tmpl` | Private | SSH Key - RSA | private key | personal |
| `dot_zshrc.tmpl` | Private | GitHub Metadata Read-Only Access Token | token | not ephemeral, not work |
| `dot_zshrc.tmpl` | Private | GitHub mise PAT | token | not ephemeral, not work |
| `dot_zshrc.tmpl` | Private | Gemini API Key | token | not ephemeral, not work |
| `dot_zshrc.tmpl` | Employee | Gemini API Key | password | work |
| `brew.env.tmpl` | Private | Homebrew GitHub API Token | token | personal |
