# Tracking hygiene: `.chezmoiignore`/`.gitignore` vs the shiinayane.com don't-track list

Ticket #50. Investigates what the repo already covers versus the article's
don't-track list (`~/.zsh_history`, `~/.config/zsh/.zcompdump*`, caches,
credentials/secrets, machine-specific fragments) and looks for tracked
files that are state/derived and shouldn't be.

Source root: `home/` (`.chezmoiroot` → `home`, confirmed at repo root).

## 1. Where zsh history actually goes

- `home/dot_zshenv.tmpl:47` sets `export ZDOTDIR="${XDG_CONFIG_HOME}/zsh"`.
  The ZDOTDIR flip described in the article as a *future* state is **already
  done** in this repo — corroborated by `docs/chezmoi-patterns-guide.md:1013`
  (`.zshenv (minimal — just XDG + ~/.local/bin + ZDOTDIR)`).
- Because zsh looks for `.zshrc` under `$ZDOTDIR`, the repo ships
  `home/dot_config/zsh/symlink_dot_zshrc.tmpl` (content: `{{ .chezmoi.homeDir }}/.zshrc`)
  so `~/.config/zsh/.zshrc` is a chezmoi-managed symlink back to the real
  `~/.zshrc` (`home/dot_zshrc.tmpl`). `home/dot_config/zsh/` contains
  *only* this symlink file — nothing else in `~/.config/zsh` is tracked.
- No `HISTFILE`/`HISTSIZE`/`SAVEHIST` is set anywhere in `home/` (checked
  `dot_zshrc.tmpl`, `dot_zshenv.tmpl`, `dot_config/shell/*.tmpl`). oh-my-zsh
  is sourced at `home/dot_zshrc.tmpl:107` (`source $ZSH/oh-my-zsh.sh`), and
  oh-my-zsh's own `lib/history.zsh` defaults `HISTFILE` to the hardcoded
  `$HOME/.zsh_history` (not `$ZDOTDIR`) when unset — so the actual shell
  history file this setup produces is `~/.zsh_history`, exactly the path
  named in the article.
- In practice interactive history recall is owned by atuin, not the zsh
  history file: `home/dot_config/shell/020-shell-tools.sh.tmpl:29-46` binds
  `Ctrl-R`/up-arrow to atuin, and `home/dot_config/atuin/config.toml.tmpl:5`
  points atuin's own sqlite DB at
  `{{ .directories.xdg_data_dir }}/atuin/history.db` — fully outside the
  chezmoi source tree, never tracked. `~/.zsh_history` still gets written by
  zsh itself as a byproduct of oh-my-zsh's default, it's just unused for
  interactive recall.
- Neither `~/.zsh_history` nor any `dot_zsh_history*` pattern is tracked
  under `home/` (confirmed via full-tree scan) and neither `.chezmoiignore`
  nor `.gitignore` has a defensive entry for it.

## 2. zcompdump handling

- `compinit` is not called directly by this config: the block that would
  call it is commented out at `home/dot_zshrc.tmpl:71-76`
  (`# autoload -Uz compinit …`). It's instead pulled in transitively via
  `source $ZSH/oh-my-zsh.sh` (`home/dot_zshrc.tmpl:107`, comment: "This
  loads compinit which is required before carapace"). oh-my-zsh's own
  `ZSH_COMPDUMP` default is `"${ZDOTDIR:-$HOME}/.zcompdump-${SHORT_HOST}"`,
  so with `ZDOTDIR=~/.config/zsh` (see §1) the dump lands at
  `~/.config/zsh/.zcompdump-<host>-<zsh-version>`.
- `~/.config/zsh` is **not** an `exact_` directory (the only `exact_`
  directory in the whole repo is `home/exact_dot_oh-my-zsh` — see §5), so
  chezmoi will not delete an untracked `.zcompdump*` file sitting next to
  the managed `.zshrc` symlink. No deletion risk today.
- However there is no `.chezmoiignore` entry for `.config/zsh/.zcompdump*`
  (compare to the oh-my-zsh cache carve-outs at
  `home/.chezmoiignore.tmpl:6-9`), and no `.gitignore` pattern for it either.
  That's pure omission-by-luck, not a documented, defended rule the way
  secrets are (§4).
- Note: `.config/zsh` and `.config/zsh/**` *are* explicitly ignored, but
  only inside the Windows-only branch (`home/.chezmoiignore.tmpl:65-66,98-99`
  — comment "Ignore non-Windows files" at line 65, `{{ if ne .chezmoi.os
  "windows" }}` at 66, `{{ else }}` at 74 introduces the Windows-only block
  containing lines 98-99, closing `{{ end }}` at 109; zsh isn't used on
  Windows at all). On macOS/Linux, where the dump actually gets created,
  there's no corresponding ignore line.

## 3. `.chezmoiignore` / `.gitignore` / `.chezmoiremove` coverage summary

**`home/.chezmoiignore.tmpl`** (templated, OS-conditional):
- Lines 1-9: oh-my-zsh cache/plugins/templates carve-outs under the
  `exact_dot_oh-my-zsh` tree — `.oh-my-zsh/cache/**` (line 6) and compiled
  Powerlevel10k `.zwc` files (line 9) are explicitly protected from the
  `exact_` deletion semantics. This *is* cache-hygiene coverage, just scoped
  to oh-my-zsh, not to zsh's own completion dump or history.
- Lines 65, 98-99: `.config/zsh` ignored, but Windows-only (see §2).
- Lines 123-124: `.config/nvim/lazy-lock.json` ignored — see §4 for the
  contradiction (it's also tracked in source).
- No entries anywhere for `.zsh_history`, `.zcompdump*`, or a generic
  `*.local` catch-all.

**`.gitignore`** (repo root, plain — not templated):
- Lines 21-30: an explicit "defence in depth" block for
  credentials/secrets — `.env`, `.env.*` (with `!.env.example` carve-out),
  `*.pem`, `*.key`, `id_rsa`, `id_ed25519`. Comment explains the intent:
  catch raw local files that might land in source by accident even though
  chezmoi's `private_*.tmpl` mechanism is already safe. This is exactly the
  "credentials belong in secret-manager templates, not plain files"
  concern from the article, and it's well covered.
- No equivalent defence-in-depth entries for history/cache/completion-dump
  patterns, nor for the local-override files in §4b.

**`home/.chezmoiremove.tmpl`**: a mix of one-time cleanup entries (old fzf
configs, stale `.gitconfig`, retired PATH-management files, retired mise
externals, renamed skills). Nothing state/cache/history related — it's
about removing chezmoi-managed files that were renamed or dropped from
source, not about runtime state.

## 4. Local-override convention vs `.chezmoiignore`

a. **Convention exists and is used** in three places:
   - `home/dot_zshrc.tmpl:158-159`:
     `[[ -f "${HOME}/.zshrc.local" ]] && source "${HOME}/.zshrc.local"` and
     the same for `~/.dotfiles.local`.
   - `home/dot_zshenv.tmpl:65`:
     `[[ -f "${HOME}/.zshenv.local" ]] && source "${HOME}/.zshenv.local"`.
   These are the direct analog of the article's `90-local.zsh` — deliberately
   unmanaged machine-specific fragments, sourced conditionally if present.

b. **Not covered by either ignore file.** No `home/dot_zshrc.local*`,
   `dot_zshenv.local*`, or `dot_dotfiles.local*` source file exists (correct —
   they should stay untracked), but there's also no defensive
   `.chezmoiignore` or `.gitignore` pattern analogous to the secrets block in
   §3 that would stop one of these from being accidentally `chezmoi add`-ed
   and committed. This is the same class of gap as `.zsh_history` in §1: the
   files aren't tracked today, but nothing *prevents* tracking them the way
   the `.env`/key patterns actively prevent secret leakage.

## 5. `exact_` directories and deletion risk

- Only one `exact_` directory exists in the entire repo:
  `home/exact_dot_oh-my-zsh` (→ `~/.oh-my-zsh`, applied with `chezmoi apply`'s
  "delete anything not in source" semantics).
- Its runtime/derived subpaths are explicitly carved out via negation/ignore
  patterns in `home/.chezmoiignore.tmpl:1-9` (plugins, cache, templates,
  compiled `.zwc` theme files) — so oh-my-zsh's own state does **not** get
  deleted on apply. This part of the article's caches concern is already
  handled correctly for the one `exact_` dir in the repo.
- No other `exact_` directory exists, so there's no equivalent risk for
  `~/.config/zsh` (it's a regular, non-exact managed dir — see §2) or
  anywhere else state files might accumulate.

## 6. Tracked files that are state-like or derived (scanned full `home/` tree)

Full-tree scan for history/cache/log/lock/session patterns
(excluding `exact_dot_oh-my-zsh`, which is vendored oh-my-zsh source, not
runtime state) found exactly one candidate:

- **`home/dot_config/nvim/lazy-lock.json`** — lazy.nvim's auto-generated
  plugin-version lockfile (a derived/state file that churns as plugins
  update; 2 commits touching it in history so far,
  `git log --oneline -- home/dot_config/nvim/lazy-lock.json`). It **is**
  tracked in git source, but `home/.chezmoiignore.tmpl:123-124` simultaneously
  ignores `.config/nvim/lazy-lock.json` at apply time. Net effect: the file
  sits in the repo accumulating plugin-version churn in git history, but
  chezmoi never actually deploys it to any machine — so tracking it doesn't
  even serve the "pin plugin versions across machines" purpose a lockfile
  normally would. This is a genuine "tracked but shouldn't be" candidate:
  either stop tracking it (and rely on `!` unignoring it if the deploy intent
  changes) or drop the chezmoiignore line if the intent is to actually
  deploy it — the current combination is dead weight.

No `.zsh_history`, `.zcompdump*`, session logs, or other cache files were
found tracked anywhere under `home/`. `skills-lock.json` and
`package-lock.json` at the repo root are lockfiles too, but both are
explicitly documented as intentionally-tracked in `.gitignore`'s comments
(`.agents/` — "regenerable from skills-lock.json, treat like node_modules";
Node toolchain lockfile for changesets) — not derived-state gaps.

## Gaps vs the article's don't-track list (summary)

| Article item | Repo state | Gap |
|---|---|---|
| `~/.zsh_history` | Never tracked; not chezmoiignored; oh-my-zsh still writes it by default even though atuin owns interactive recall | No defensive ignore entry (contrast with `.env`/key block in `.gitignore:21-30`) |
| `~/.config/zsh/.zcompdump*` | Never tracked; lands under a non-`exact_` dir so no deletion risk; `.config/zsh` is only chezmoiignored on Windows (`home/.chezmoiignore.tmpl:65-66,98-99`), not on the mac/Linux paths where the dump is actually created | No defensive ignore entry on the platforms that matter |
| Caches generally | oh-my-zsh's own cache is well handled (`home/.chezmoiignore.tmpl:1-9`) via ignore carve-outs inside its `exact_` dir | Handled for oh-my-zsh specifically; no general cache pattern exists (none needed elsewhere today — no other `exact_` dirs) |
| Credentials/secrets | Explicit defence-in-depth block, `.gitignore:21-30`, plus chezmoi's `private_*.tmpl` mechanism | Well covered — no gap |
| Machine-specific fragment (their `90-local.zsh`) | Equivalent convention exists (`.zshrc.local`, `.zshenv.local`, `.dotfiles.local`, sourced conditionally) and is never tracked | No defensive ignore entry, same class of gap as history/zcompdump |

**Tracked-but-shouldn't-be candidate:** `home/dot_config/nvim/lazy-lock.json`
(§6) — tracked and simultaneously chezmoiignored, making its presence in git
history pure churn with no deployment effect.

**Everything else checked out clean:** no history files, completion dumps,
or session logs are actually tracked; the one `exact_` directory in the repo
already has correct cache carve-outs; the ZDOTDIR flip described as "future"
in the ticket is already live and the `~/.config/zsh/.zshrc` symlink
approach correctly avoids exact-dir deletion risk for a hypothetical
zcompdump living alongside it.
