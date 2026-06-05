# VS Code → Zed Migration Strategy

**Status:** Draft, awaiting decisions
**Created:** 2026-04-28
**Owner:** Drew

## Goal

Make Zed the daily driver. Keep VS Code as a curated **specialty/backup** editor for tasks Zed can't do (Jupyter, MSSQL, Wallaby Pro, Nx Console, etc). Manage both editor configs in chezmoi so they sync across macOS and Windows.

## Why

- VS Code is bloated: 108 extensions installed, many redundant or stale.
- None of the real VS Code config is in chezmoi today (only `mcp.json.tmpl`); state lives in opaque Settings Sync cloud blob.
- Zed is now mature enough (debugger landed, SSH remote stable, native Claude Code via ACP) to be a real daily driver for ~80% of work.
- A two-editor strategy lets us migrate without losing access to specialty tooling like Wallaby/Console Ninja Pro, MSSQL queries, Jupyter notebooks, Nx Console.

## Constraints

- **Cross-platform:** Same chezmoi setup applies to macOS and Windows machines.
- **Tiny incremental changes** (per project memory): one small, verifiable step at a time. Do not propose big-bang migrations.
- **Settings Sync stays on** during transition — chezmoi captures snapshots, Sync handles drift between snapshots until we're confident.

---

## Phase plan

| Phase | What | Reversible? |
|---|---|---|
| 1 | Drop universally-redundant extensions on both OSes | Trivial — re-install if needed |
| 2 | Capture VS Code state into chezmoi (settings/keybindings/extensions list) | Pure addition, no risk |
| 3 | Stand up Zed config in chezmoi (vim, theme, AI provider, extensions) | Lives alongside VS Code config; both work |
| 4 | Trial period: default to Zed, drop into VS Code only when reaching for it | Stop opening Zed if it's bad |
| 5 | Curate VS Code "specialty kit" based on what was actually opened in trial | Trim or restore based on real data |

---

## Decisions needed

For each, mark **USE**, **DROP**, or **SOMETIMES**. Affects which extensions land in the specialty kit and which get uninstalled in Phase 1.

```
[ ] 1. .ipynb Jupyter notebooks — do you open them?
[ ] 2. MSSQL queries from the editor — do you?
[ ] 3. PHP — do you write any?
[ ] 4. C++ — do you write any?
[ ] 5. Wallaby Pro (console-ninja, quokka) — actively using your Pro license?
[ ] 6. Azure pipelines / Azure repos / Azure resource groups — current work tooling?
[ ] 7. Live Share — pair-program in VS Code with someone?
[ ] 8. Stream Deck integration — bound to VS Code commands?
[ ] 9. Bunch (kotfu.bunch) — do you trigger Bunches from editor?
[ ] 10. Nx Console / Moon Console — actively driving these UIs?
[ ] 11. Notepad++ keybindings on Windows — purposeful or leftover?
[ ] 12. PowerShell extension on Windows — yes/no?
[ ] 13. WSL remote on Windows — yes/no?
```

---

## Phase 1 — Drop list (cross-platform safe)

These are redundant or dead regardless of platform. ~22 extensions.

```
asvetliakov.vscode-neovim                            # conflicts with vscodevim, no config
github.copilot-labs                                  # deprecated by GitHub
openai.chatgpt                                       # stale config, never finished setup
ms-vscode-remote.remote-ssh-edit                     # part of remote-ssh, redundant
ms-vscode.remote-explorer                            # subsumed by other remote tools
ms-vscode.remote-server                              # internal helper, unused on its own
ms-azuretools.vscode-containers                      # redundant with vscode-docker
chrisdias.vscode-opennewinstance                     # one-off VS Code utility
ritwickdey.liveserver                                # keep ms-vscode.live-server
techer.open-in-browser                               # cmd-click in terminal
samverschueren.linter-xo                             # xo linter is dead
deepakkamboj0121.vscode-playwright-test-snippets     # snippet pack
mskelton.playwright-test-snippets                    # snippet pack
nitayneeman.playwright-snippets                      # snippet pack — pick zero of three
wayou.vscode-todo-highlight                          # redundant with todo-tree
zobo.php-intellisense                                # redundant with intelephense (if PHP at all)
ms-vsliveshare.vsliveshare-pack                      # wraps vsliveshare itself
github.remotehub                                     # niche, paired w/ remote-repos
codezombiech.gitignore                               # template files better
docsmsft.docs-yaml                                   # MS-internal schema
pkief.material-icon-theme                            # vscode-icons is your active theme
```

## Platform-conditional (leave installed, no-op on wrong OS)

These activate only on Windows. Don't drop them — chezmoi will install them on the Windows side via templating:

```
ms-vscode-remote.remote-wsl
ms-vscode.powershell
ms-vscode.notepadplusplus-keybindings   # only if Q11 = USE
```

---

## Phase 5 — Candidate specialty kit (~28)

Final list depends on the decisions above. This is the working draft.

### Tier A — Specialty (Zed can't replicate)

```
wallabyjs.console-ninja                  # requires Q5 = USE
wallabyjs.quokka-vscode                  # requires Q5 = USE
ms-toolsai.jupyter                       # requires Q1 = USE
ms-toolsai.jupyter-keymap                # requires Q1 = USE
ms-toolsai.jupyter-renderers             # requires Q1 = USE
ms-toolsai.vscode-jupyter-cell-tags      # requires Q1 = USE
ms-toolsai.vscode-jupyter-slideshow      # requires Q1 = USE
ms-mssql.mssql                           # requires Q2 = USE
ms-playwright.playwright                 # test runner UI
github.vscode-pull-request-github        # PR review (alt: gh CLI)
github.vscode-github-actions             # workflow editing
nrwl.angular-console                     # requires Q10 = USE
moonrepo.moon-console                    # requires Q10 = USE
yoavbls.pretty-ts-errors                 # TS error display
mattpocock.ts-error-translator           # TS error translation
shd101wyy.markdown-preview-enhanced      # mermaid/PlantUML
ms-azure-devops.azure-pipelines          # requires Q6 = USE
ms-azuretools.vscode-azureresourcegroups # requires Q6 = USE
ms-vscode.azure-repos                    # requires Q6 = USE
ms-vsliveshare.vsliveshare               # requires Q7 = USE
nicollasr.vscode-streamdeck              # requires Q8 = USE
kotfu.bunch                              # requires Q9 = USE
```

### Tier B — Quality of life when in VS Code

```
vscodevim.vim
esbenp.prettier-vscode
dbaeumer.vscode-eslint
eamodio.gitlens
streetsidesoftware.code-spell-checker
gruntfuggly.todo-tree
aaron-bond.better-comments
vscode-icons-team.vscode-icons
anthropic.claude-code
mikestead.dotenv
tamasfe.even-better-toml
redhat.vscode-yaml
redhat.vscode-xml
golang.go                                # if writing Go in VS Code at all
ms-python.python                         # only if Jupyter Q1 = USE
ms-python.vscode-pylance                 # only if Q1 = USE
ms-python.debugpy                        # only if Q1 = USE
naumovs.color-highlight
```

### Tier C — Windows-conditional

```
ms-vscode.powershell                     # requires Q12 = USE
ms-vscode-remote.remote-wsl              # requires Q13 = USE
ms-vscode.notepadplusplus-keybindings    # requires Q11 = USE
```

### Removed entirely from VS Code (Zed handles)

Daily code editing, vim mode, formatting, LSP, git basics, Claude Code CLI, SSH remote dev, terminal — all stay in Zed.

---

## chezmoi structure (target)

```
home/
  Library/Application Support/Code/User/
    settings.json.tmpl              # NEW — platform-conditional
    keybindings.json.tmpl           # NEW
    mcp.json.tmpl                   # existing
  AppData/Roaming/Code/User/
    (symlinked or templated to same source)
  .config/zed/
    settings.json.tmpl              # NEW
    keymap.json.tmpl                # NEW
    extensions.toml.tmpl            # NEW

  shared:
    vscode-extensions.txt.tmpl      # NEW — list, platform-conditional
    run_once_install_vscode_extensions.sh.tmpl
    run_once_install_zed_extensions.sh.tmpl
```

The `run_once_install_*` scripts should be **idempotent**: read the extensions file, diff against `code --list-extensions` / `zed --list-extensions`, install missing, optionally uninstall extras (gated behind a confirmation flag).

---

## Open questions / TODOs

- [ ] Decide answers to the 13 questions above
- [ ] Confirm the chezmoi structure (especially how to share the extensions list across both OSes — single source file with platform conditionals vs separate files)
- [ ] Verify Pylance vs Pyright tradeoff is acceptable (if Q1 = USE)
- [ ] Check Zed extension marketplace for: spell-check equivalent, todo-panel equivalent, better-comments equivalent — these are gaps that may have community fills by now
- [ ] Decide on Zed AI provider config: Anthropic API key direct vs Claude Code via ACP
- [ ] Trial duration: 2 weeks default, may need 3-4 if specialty work is rare in any given week

## Reference

The full extension audit and gap analysis is captured inline above (Phase 1 drop list + Phase 5 specialty kit).

Key live commands:
```
code --list-extensions                    # current installed
code --install-extension <id>             # install by ID
code --uninstall-extension <id>           # remove by ID
zed --list-extensions                     # Zed equivalent
```
