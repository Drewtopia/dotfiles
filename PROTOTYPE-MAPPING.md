# PROTOTYPE — zshrc fragment split (wayfinder ticket #47)

Throwaway artifact. Maps every line of `home/dot_zshrc.tmpl` (169 lines) to its
proposed new home. Nothing here is applied; execution is separate PRs after the
map's decisions lock.

## Proposed layout

```
~/.config/zsh/.zshrc          thin loader (~30 lines incl. comments)
~/.config/zsh/conf.d/
├── 05-instant-prompt.zsh     p10k instant prompt (must run first)
├── 10-options.zsh            setopts
├── 20-aliases.zsh            zshconfig/zshrc aliases (ZDOTDIR paths)
├── 50-framework.zsh          OMZ vars + zinit + plugins + oh-my-zsh.sh (order-critical blob)
├── 60-prompt.zsh             PROMPT override + p10k source
└── (90-local.zsh)            placeholder — ticket #48 decides local-override shape
~/.config/shell/              existing shared tier, unchanged
```

Deliberately absent: `00-env` (env lives in `.zshenv`), `30-functions` (ticket
#49 adds the drift check there later), `35-tools`/`40-lang` (shared
`shell/010-mise.sh` + `020-shell-tools.sh` already own that tier).

## Line mapping (old `dot_zshrc.tmpl` → new)

| Old lines | Content | New home |
|---|---|---|
| 1–2 | interactive guard | thin `.zshrc` |
| 4–5, 166–167 | ZPROF profiling bookends | thin `.zshrc` (must wrap everything) |
| 7, 16, 21, 27, 66, 68, 81 | OMZ vars (`ZSH_CUSTOM`, `ZSH`, theme, update, `HIST_STAMPS`, compfix, `plugins=()`) | `50-framework.zsh` |
| 8–13 | p10k instant prompt | `05-instant-prompt.zsh` |
| 23–65, 70–76 | OMZ installer boilerplate comments + commented compinit optimization | `50-framework.zsh` (kept — decided) |
| 85–112 | zinit init, `fzf-tab`, syntax-highlighting, `ZSH_TMUX_FIXTERM`, OMZP snippets, `oh-my-zsh.sh`, `cdreplay` | `50-framework.zsh` (order preserved exactly) |
| 116 | `PROMPT` override | `60-prompt.zsh` |
| 118–120 | `setopt` × 3 | `10-options.zsh` |
| 123–124 | `zshconfig`/`zshrc` aliases | `20-aliases.zsh` (paths → `$ZDOTDIR`) |
| 128–134 | `EDITOR` template with nvim-path fallback | `.zshenv` (fallback logic replaces its plain `EDITOR=nvim` — decided) |
| 136–141 | `LANG`, `LC_ALL`, `LESS`, `PAGER` | **dies** — exact duplicates of `.zshenv` |
| 144 | `RIPGREP_CONFIG_PATH` | `.zshenv` XDG-aware block (decided) |
| 147, 122, 164 | stale "moved to…" comments | **dies** |
| 149–151 | shell-loader source | thin `.zshrc` (after conf.d — carapace needs OMZ's compinit) |
| 153–155 | worktrunk init | shared `shell/020-shell-tools.sh` with per-shell guard, like atuin/fnox (decided) |
| 157–159 | `.zshrc.local` / `.dotfiles.local` | thin `.zshrc` for now; final shape owned by ticket #48 |
| 162 | p10k source | `60-prompt.zsh` (`~/.p10k.zsh` location owned by #48) |
| 169 | vim modeline | thin `.zshrc` |

## Resolved (2026-07-14)

1. **Framework layer**: one order-critical `50-framework.zsh` blob — no further split.
2. **EDITOR**: template fallback logic moves into `.zshenv`, replacing its plain export.
3. **worktrunk hook**: moves to shared `shell/020-shell-tools.sh` (wt supports bash).
4. **`RIPGREP_CONFIG_PATH`**: moves to `.zshenv` XDG-aware block.
5. **Comments**: ALL commented-out content kept — OMZ boilerplate wall and
   commented compinit optimization live on inside `50-framework.zsh`. Only
   true duplicates (`LANG`/`LC_ALL`/`LESS`/`PAGER`) and stale "moved to…"
   pointer comments die.
