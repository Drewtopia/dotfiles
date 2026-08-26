# chezmoi quirks (Reference)

Working knowledge for agents editing this repo. Relocated from global agent memory 2026-08-27.

## `chezmoi add` + `git.autoCommit = true` gotcha

`~/.config/chezmoi/chezmoi.toml` has:
```toml
[git]
    autoCommit = true
    commitMessageTemplate = "{{ promptString `Commit message` }}"
```

With `autoCommit = true`, any source-mutating chezmoi command (`add`, `re-add`, etc.) with unrelated WIP in the repo:

1. **Hangs on the commit-message prompt** — `promptString` waits for interactive input invisible to non-TTY callers.
2. **Stages the entire working tree** — sweeps incidental modifications into the same commit.

Apply:
- For one-off file additions with WIP present, **Write directly to the source path** (e.g. `home/dot_config/<app>/file.tmpl`) rather than `chezmoi add`. Established workflow: edit source directly, commit later via `/commit`.
- If `chezmoi add` is genuinely needed (permission metadata, `dot_` prefix logic, `--autotemplate`), commit or stash unrelated WIP first.
- Verify with `chezmoi managed | grep <name>` and `chezmoi diff <livepath>` (empty diff = source matches live).

## Path mapping

- Live `~/.config/foo/bar.json` → source `home/dot_config/foo/bar.json[.tmpl]`
- Live `~/.claude/file` → source `home/dot_claude/file[.tmpl]`
- `dot_` prefix on directory names replaces the leading dot in the live path.
- `.tmpl` extension is the convention even without substitutions (consistency + future per-machine variation).

## Skill mode restriction

The `chezmoi-config` skill is read-only and forbids `chezmoi apply` / `chezmoi update`. Show a `chezmoi diff`; the user runs `chezmoi apply`.

## Agent-memory vault-junction architecture (2026-04-27)

The agent memory system lives in a private vault repo (`git@github.com:Drewtopia/claude-vault.git`) cloned to `~/.claude-vault/` on every OS. `~/.claude/memory` links to `~/.claude-vault/memory`.

**Why split repo + link:** keeps vault data outside `.claude/`; direct-cloning into `~/.claude/memory/` also produces a broken nested `memory/memory/` layout because the vault repo's top level is itself `memory/`.

**Cross-platform link mechanism:**
- **Mac/Linux:** symlink via `dot_claude/symlink_memory.tmpl` (`{{ .chezmoi.homeDir }}/.claude-vault/memory`).
- **Windows:** `.chezmoiscripts/common/run_after_99-claude-memory-junction.ps1.tmpl` creates an NTFS junction (`cmd /c mklink /J`) — no Developer Mode needed on locked-down machines.

**Canonical surface (four files under `home/`):**
- `.chezmoiexternal.toml.tmpl` — unconditional `[".claude-vault"]` git-repo external.
- `.chezmoiignore.tmpl` — `!.claude/memory` un-ignore on Mac/Linux only; Windows leaves the junction alone.
- `.chezmoiscripts/common/run_after_99-claude-memory-junction.ps1.tmpl` — idempotent; detects correct junction, replaces wrong targets, refuses to clobber a real directory.

Don't reintroduce per-OS or `.work`-based branching for the vault clone. PS1 idiom for junction/symlink detection: `$item.Attributes -match "ReparsePoint"`. Fresh Windows machine: `chezmoi apply` clones the vault, then the `99-` script creates the junction.

## How `.work` is determined

`home/.chezmoi.toml.tmpl`: default `false`; non-personal hostnames (not in `["andrews-desktop", "drew-pd"]`) prompt "Is this your personal machine?" — "no" → `work = true`. Since 2026-04-27 no templates branch on `.work` for the vault setup.

## Five-layer architecture

1. **chezmoi** — config files, bootstraps mise + OS pkg manager, 1Password secrets
2. **mise** — all CLI tools and runtimes
3. **OS package manager** — system deps + GUI only (brew ~15 formulae macOS, scoop few Windows, apt Ubuntu)
4. **chezmoi externals** — plugins only (zsh, tmux, skills, fonts, tool themes)
5. **Shell config** — `.zshenv` (env) → `000-paths.sh` → `010-mise.sh` → `020-shell-tools.sh`

## Feature flags

- `dev_computer` — gates mise and dev tools
- `ephemeral` — skip secrets, fonts
- `work` / `personal` — vault, email, tool selection
- `is_wsl` — PATH filtering, `op.exe` alias
- `osid` — Ubuntu-specific apt packages

## Patterns

- `.chezmoiignore` filters `.ps1` on Unix, `.sh` on Windows
- `run_after` for mise (not `run_onchange`) — ensures mise exists every apply
- `run_before` for TV channels — community cables download before chezmoi overwrites
- Windows PS1 scripts re-launch with pwsh 7 if under 5.1
- `bun x` not `bunx` on Windows

## VCS: plain git, not jj (2026-03-26)

jj's colocated mode leaves git on detached HEAD; `chezmoi update` uses `git pull` and fails there. jj hooks in `settings.json` remain for code repos, gated behind `lookPath "jj"`.

## Windows bootstrap (chicken-and-egg)

- `[interpreters.ps1]` = `"powershell.exe"` (built-in 5.1) so scripts bootstrap on stock machines; `[cd] command = "pwsh"` interactive only.
- Boot: `00-install-pwsh.ps1` (winget pwsh 7) → `01-install-scoop.ps1` → 1Password CLI → `install-packages.ps1`.
- **Constraint:** scripts must stay PowerShell-5.1-compatible.

## Theme management — Catppuccin Mocha unified

| Strategy | Example tools | Method |
|---|---|---|
| Built-in | atuin, television, tmux (plugin) | tool's own config |
| Flag-based | bat | `--theme="Catppuccin Mocha"` |
| External theme repo | eza, yazi, btop | chezmoi external from `catppuccin/{tool}` |
| Inherits fzf colors | navi | `FZF_DEFAULT_OPTS` in `020-shell-tools.sh` |

Theme externals live in `.chezmoiexternal.toml.tmpl`. New tool → check for a Catppuccin theme + override mechanism, follow the externals pattern.

## Brew + .zshenv coordination

`HOMEBREW_FORBIDDEN_FORMULAE` in `.zshenv` prevents re-installation of formulae migrated to mise. After `brew uninstall X`, add `X` to the forbidden list.

## Packages manifest: deferred (2026-04-29)

Considered consolidating `install-*` scripts into `.chezmoidata/packages.yaml`. Deferred: no cross-platform reference exists; install-source dimensions (brew casks/args/taps, scoop buckets, apt/snap conditionals) make it a small DSL; mise already deduplicates cross-platform tools. **Revisit trigger:** same tool added to three scripts repeatedly, or platform drift.

## Shell config patterns

- Loading order: `.zshenv` → `000-paths.sh` → `010-mise.sh` → `020-shell-tools.sh`.
- fzf init: `eval "$(fzf --zsh)"`.
- carapace: sourced from `020-shell-tools.sh` AFTER mise activates (needs active tool PATH).
- Per-machine overrides: `.zshenv.local` + `.zshrc.local`, gitignored, sourced after tracked files.
