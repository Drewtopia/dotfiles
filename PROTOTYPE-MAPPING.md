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
| 23–65, 70–76 | OMZ installer boilerplate comments + commented compinit optimization | **dies** (pending confirm) |
| 85–112 | zinit init, `fzf-tab`, syntax-highlighting, `ZSH_TMUX_FIXTERM`, OMZP snippets, `oh-my-zsh.sh`, `cdreplay` | `50-framework.zsh` (order preserved exactly) |
| 116 | `PROMPT` override | `60-prompt.zsh` |
| 118–120 | `setopt` × 3 | `10-options.zsh` |
| 123–124 | `zshconfig`/`zshrc` aliases | `20-aliases.zsh` (paths → `$ZDOTDIR`) |
| 128–134 | `EDITOR` template with nvim-path fallback | **open Q** — `.zshenv` already sets `EDITOR=nvim`; either fold fallback logic into `.zshenv` or drop it |
| 136–141 | `LANG`, `LC_ALL`, `LESS`, `PAGER` | **dies** — exact duplicates of `.zshenv` |
| 144 | `RIPGREP_CONFIG_PATH` | **open Q** — belongs with XDG block in `.zshenv` (not zsh-specific) |
| 147, 122, 164 | stale "moved to…" comments | **dies** |
| 149–151 | shell-loader source | thin `.zshrc` (after conf.d — carapace needs OMZ's compinit) |
| 153–155 | worktrunk init | thin `.zshrc` — **open Q**: wt supports bash; could move to shared `020-shell-tools.sh` |
| 157–159 | `.zshrc.local` / `.dotfiles.local` | thin `.zshrc` for now; final shape owned by ticket #48 |
| 162 | p10k source | `60-prompt.zsh` (`~/.p10k.zsh` location owned by #48) |
| 169 | vim modeline | thin `.zshrc` |

## Open questions (react to these)

1. **One `50-framework` blob or split zinit/OMZ?** Blob keeps the fragile
   ordering in one visibly order-critical file. Splitting looks cleaner but
   invites reorder bugs.
2. **EDITOR fallback** — keep the nvim-path/lookPath template logic (move to
   `.zshenv`) or accept plain `EDITOR=nvim`?
3. **worktrunk hook** — thin `.zshrc` or shared `shell/` tier?
4. **`RIPGREP_CONFIG_PATH`** — move to `.zshenv` XDG block?
5. **Deletions** — OMZ boilerplate comments (lines 23–65) and the commented-out
   compinit optimization (lines 70–76) die. Confirm, or keep any?
