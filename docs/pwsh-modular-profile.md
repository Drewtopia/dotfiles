# Structuring a Modular, Resilient PowerShell 7 `$PROFILE`

> **Type:** Reference (research note)
> **Date:** 2026-09-02
> **Scope:** Splitting the monolithic pwsh `$PROFILE` into ordered per-tool/per-concern files loaded by a thin, error-isolating loader — matching the numbered `shell.d` pattern already used on the zsh side of this repo.
> **Subject profile:** `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`

The current profile inlines ~8 external tool inits (`mise activate`, `oh-my-posh`, `atuin`, `carapace`, `zoxide`, `television`/`tv`, `pay-respects`, `fnox`) plus PSReadLine setup, keybindings, and helper functions in a single 238-line file. Its failure mode: a terminating error partway down — e.g. a starved cold spawn under heavy AV/EDR load — aborts everything *after* it in the file, so a hiccup in one init silently takes out atuin and all later setup. This note captures, against primary sources, how to convert that monolith into a directory of ordered modules loaded by a thin loader that isolates each module so one failure logs and is skipped rather than killing the rest.

This is the companion to `docs/pwsh-lazy-load-tool-inits.md`, which covers *deferring* individual inits behind first-use (the stub-function and OnIdle patterns). That note answers "which inits can run later?"; this one answers "how do I lay the profile out so a failing init can't cascade?". Section 5 cross-references it rather than repeating it.

The zsh side already does the directory approach: `home/dot_config/shell-loader.sh.tmpl` globs `"$HOME/.config/shell"/*.sh` and `source`s each of the numbered files (`000-paths` … `055-kanata`). Note it has **no per-file error isolation** — a `source` that hits a hard error can still abort the loop. The pwsh loader below fixes that gap.

---

## Table of Contents

- [1. The conf.d / profile.d modular pattern — and dot-source vs call-operator scope](#1-the-confd--profiled-modular-pattern--and-dot-source-vs-call-operator-scope)
- [2. Per-module error isolation with try/catch](#2-per-module-error-isolation-with-trycatch)
- [3. Load-ordering constraints and deterministic sort](#3-load-ordering-constraints-and-deterministic-sort)
- [4. Real-world prior art](#4-real-world-prior-art)
- [5. Deferred / lazy hooks inside a module file](#5-deferred--lazy-hooks-inside-a-module-file)
- [Recommended layout for this repo](#recommended-layout-for-this-repo)

---

## 1. The conf.d / profile.d modular pattern — and dot-source vs call-operator scope

### The pattern

A PowerShell profile is itself just a script that PowerShell runs at startup, and everything it defines lands in the **global scope**: "The variables, aliases, and functions in your PowerShell profiles are also created in the global scope. The global scope is the root parent scope in a runspace." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_scopes

So the modular pattern is: keep `Microsoft.PowerShell_profile.ps1` (the **CurrentUserCurrentHost** profile, which "always runs last" and is "the profile most often referred to as *your PowerShell profile*") as a thin loader that enumerates a directory of ordered `.ps1` files and **dot-sources** each one. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles

```powershell
$moduleDir = Join-Path (Split-Path $PROFILE.CurrentUserCurrentHost) 'profile.d'
Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' |
    Sort-Object Name |
    ForEach-Object { . $_.FullName }
```

`about_Profiles` itself models the dot-source-a-profile-script idiom in its remote-session example, and states the reason explicitly: "We use dot sourcing operator so that the profile executes in the current scope on the remote computer and not in its own scope." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles

### Why dot-source (`.`) and never call-operator (`&`) — this is the load-bearing detail

The two operators differ in scope, and for a profile loader the difference decides whether your functions, aliases, and keybindings survive the module returning.

- **Dot-sourcing** (`. file`): "Runs a script in the current scope so that any functions, aliases, and variables that the script creates are added to the current scope, overriding existing ones. … However, the automatic variable `$args` is preserved." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_operators
- **Call operator** (`& file`): "The call operator, also known as the *invocation operator* … The call operator executes in a child scope." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_operators

`about_Scopes` says the same thing from the scope side, in its "Using dot-source notation with scope" section: "When you run a script or function using dot-source notation, it runs in the current scope. Any functions, aliases, and variables in the script or function are added to the current scope." versus "Using the call operator to run a function or script runs it in script scope. Using the call operator is no different than running the script by name." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_scopes

Consequence for this loader: because the loader runs in **global scope** (it *is* the profile), dot-sourcing each module runs that module in global scope too, so the module's `function foo { }`, `Set-Alias`, `$var`, and — critically — the definitions emitted by `tool init | Invoke-Expression` all land in the session and persist. Run the same module with `&` and it executes in a **child (script) scope**: any definition that isn't explicitly written to `Global:` evaporates the instant the module returns. Several of this profile's tool inits (`zoxide init powershell`, `carapace _carapace`, `tv init power-shell`, `atuin init powershell`) are piped through `Invoke-Expression`; under `&`, `Invoke-Expression` runs in that disposable child scope, so any non-`Global:` function or variable the init defines is lost. `Set-PSReadLineKeyHandler` mutates the PSReadLine console session rather than a PowerShell scope, so keybindings alone would happen to survive `&` — but the rule that keeps *everything* working is uniform: **dot-source every module.**

> Note on `$args`: dot-sourcing preserves the automatic `$args` variable (quoted above), so the loader must not accidentally forward arguments it doesn't intend. In the loop above no arguments are passed, so each module sees the profile's own (empty) `$args`.

The "profile.d/conf.d" name is a Unix convention (adapted from `/etc/profile.d`, and mirrored by this repo's own zsh `shell.d`). **There is no Microsoft-blessed `profile.d` mechanism** — PowerShell auto-runs only the fixed set of profile files enumerated in `about_Profiles`; a module directory is something the loader implements by hand. Treat the directory name as a local convention, not a documented feature. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles

---

## 2. Per-module error isolation with try/catch

The goal: wrap each dot-source so a module that throws is logged and skipped, and the loader continues to the next module.

```powershell
Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' | Sort-Object Name | ForEach-Object {
    try {
        . $_.FullName
    } catch {
        Write-Warning "profile module '$($_.Name)' failed: $($_.Exception.Message)"
    }
}
```

Wait — inside a `ForEach-Object` `catch`, `$_` is the **error record**, not the pipeline file, because the `catch` block rebinds `$_`/`$PSItem` to the current error ("the current error can be accessed using the `$_` or `$PSItem` automatic variable"). — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally

So capture the filename before the `try`, or use a `foreach` statement (which doesn't rebind `$_`):

```powershell
foreach ($module in Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' | Sort-Object Name) {
    try {
        . $module.FullName
    } catch {
        Write-Warning "profile module '$($module.Name)' failed: $($_.Exception.Message)"
    }
}
```

### What try/catch actually catches — the sharp edge

`try/catch` catches **terminating** errors only — both kinds: "*statement-terminating* errors that stop the current statement" and "*script-terminating* errors that unwind the entire call stack. Both kinds are caught by `try/catch`." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally

A **parse/syntax error** in a dot-sourced file, and a `throw`, are terminating, so the loader's `catch` cleanly contains them — exactly the "one bad file shouldn't kill the rest" case. But a **non-terminating error** (the default for `Write-Error` and most cmdlet failures) is *not* caught, because the default `$ErrorActionPreference` is `Continue`: "**Continue**: (Default) Displays the error message and continues executing." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables

Two implications:

1. **Module-to-module isolation is already guaranteed by the `try/catch` for terminating errors, and non-terminating errors never abort the loop anyway** (they just print and continue). So the loader loop above is sufficient to stop one module from killing the others.

2. **If you want a module to stop at its *first* soft failure** (rather than plough on through a half-broken init and emit confusing follow-on errors), convert non-terminating errors to terminating inside that module. Set `$ErrorActionPreference = 'Stop'` so the `catch` fires: "When set to **Stop**, it escalates non-terminating errors to script-terminating errors." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables. Or override per-command with `-ErrorAction Stop`; note the preference variable is broader — "Unlike the `-ErrorAction` parameter (which only affects non-terminating errors), the preference variable can also suppress or escalate errors generated by `$PSCmdlet.ThrowTerminatingError()`." — same page.

Scope the escalation carefully. Preference-variable changes "apply only in the scope they are made and any child scopes thereof." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables. Because a dot-sourced module runs in the **global** scope (Section 1), a bare `$ErrorActionPreference = 'Stop'` in a module would leak into the whole interactive session. Keep the escalation local — set it and restore it within the module, or (cleaner) set it once for the loader's own work and restore afterward. A robust loader form:

```powershell
$prevEAP = $ErrorActionPreference
foreach ($module in Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' | Sort-Object Name) {
    try {
        $ErrorActionPreference = 'Stop'      # make soft failures inside the module catchable
        . $module.FullName
    } catch {
        Write-Warning "profile module '$($module.Name)' failed: $($_.Exception.Message)"
    } finally {
        $ErrorActionPreference = $prevEAP    # restore for the interactive session
    }
}
```

`finally` runs regardless of success or failure ("The `finally` keyword is followed by a statement list that runs every time the script is run, even if the `try` statement ran without error or an error was caught"), so `$ErrorActionPreference` is always restored. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally

> Caveat: escalating to `Stop` is a judgment call per module. A module that legitimately produces a non-terminating error mid-way (some tool inits `Write-Error` a benign warning about an optional feature) would be aborted early under `Stop`. For those, keep `Continue` and rely on the module boundary — the `try/catch` still contains any genuinely terminating error. The current profile already leans on this: its PSReadLine prediction setup uses `-ErrorAction Stop` inside a `try/catch` precisely so a non-VT host is caught and skipped rather than silently continuing.

---

## 3. Load-ordering constraints and deterministic sort

### The constraints that a split MUST preserve

The monolith encodes a real ordering contract (documented in its own comments and cross-verified in `docs/pwsh-lazy-load-tool-inits.md` §3). Any directory split has to keep these in the same relative order:

1. **PATH heal + `mise activate` run first.** "Most mise-managed tools on Windows install to … paths that only `mise activate` adds to PATH … Must run BEFORE the tool inits below (carapace/atuin/tv/etc), or those inits can't find their binaries and silently skip." — profile source, `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`. `mise activate pwsh` installs a per-prompt `hook-env` hook. — https://mise.jdx.dev/cli/activate.html
2. **PSReadLine imports before any key-binder.** "Ensure PSReadLine is loaded before tool inits that bind keys (atuin, tv, carapace)" — else those inits bail with "requires the PSReadLine module." — profile source.
3. **`tv` before `atuin` — "last binder wins" for `Ctrl+R`.** tv's pwsh init unconditionally binds `Ctrl+R`, so atuin must bind *after* tv to win it; `Ctrl+T` stays with tv. — profile source; https://docs.atuin.sh/main/reference/init/. Verified in tv's source in the sibling note: the completion template always emits `Set-PSReadLineKeyHandler` for `Ctrl+T`/`Ctrl+R`.
4. **carapace binds `Tab`** and needs `Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete` present at startup. — https://carapace-sh.github.io/carapace-bin/setup.html

A **zero-padded numeric filename prefix** encodes all of this deterministically: `000-path-heal`, `010-mise`, `015-psreadline`, `030-carapace`, `050-television`, `055-atuin` — the sort order *is* the load order, and the gaps leave room to insert without renaming.

### Is Get-ChildItem's order guaranteed? No — sort explicitly

`Get-ChildItem`'s own reference documents **no** ordering guarantee (its Notes cover recursion and aliases, never sort order). — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-childitem. Underneath, the FileSystem provider hands back what the .NET enumeration APIs return, and those are explicit that order is not guaranteed: "The order of the returned file names is not guaranteed; use the [Sort] method if a specific sort order is required." — https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.getfiles (stated identically for every `GetFiles` overload; `Directory.EnumerateFiles` carries no ordering promise either — https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.enumeratefiles).

In practice NTFS tends to return names pre-sorted and Linux/macOS filesystems do not, but **relying on that is relying on undocumented behavior**. Because a mis-ordered profile fails silently and confusingly (wrong tool owns `Ctrl+R`), always pipe through `| Sort-Object Name` — as the loader in Sections 1–2 does. This also makes the pwsh loader more robust than the repo's zsh `shell-loader.sh`, which leans on the shell glob's implicit sort.

**Culture note:** `Sort-Object Name` sorts strings using the current culture by default. For zero-padded ASCII digit prefixes (`000`, `010`, `055`) this is safe and deterministic across cultures — the ASCII digits `0`–`9` collate identically in every culture, so `010` always precedes `055`. Zero-padding also avoids the lexical `10`-before-`2` trap that unpadded numbers would hit. If you want to remove culture from the equation entirely, sort ordinally:

```powershell
Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' |
    Sort-Object -Property Name -Culture ([System.Globalization.CultureInfo]::InvariantCulture)
```

For this repo's fixed ASCII numeric scheme, plain `Sort-Object Name` is sufficient; the invariant-culture form is belt-and-suspenders.

---

## 4. Real-world prior art

**This repo's zsh side** is the closest prior art: `home/dot_config/shell-loader.sh.tmpl` sources numbered `*.sh` files from `~/.config/shell`. The pwsh loader here is the direct translation, plus the per-file `try/catch` isolation the bash loop lacks.

**PSProfile (SCRT-HQ/PSProfile)** — a mature, cross-platform profile-management **module** on the PowerShell Gallery — is the notable "don't hand-roll a loader, use a framework" alternative. Its design goal is a one-line profile: "PSProfile only needs one line: `Import-Module PSProfile`." It moves everything the monolith inlines into *layered configuration* (it "uses PoshCode's Configuration module to handle the layered Configuration"): `ScriptPaths` to invoke, modules to ensure-installed/imported, a credential `Vault`, stored prompts with quick switching (`Switch-Prompt Demo`), and a `Plugin` system where "A PSProfile Plugin can be a simple script or a full module." — https://github.com/SCRT-HQ/PSProfile (README, "Background"). It is powerful but heavy: it pulls in a configuration engine and its own object model, which is a lot of surface for a profile whose main job is running eight `tool init` lines in a fixed order. For this repo, a hand-rolled numbered-directory loader stays closer to the zsh side and adds no dependency.

The general "hand-rolled loader that dot-sources a directory" idiom is widespread in community pwsh dotfiles; it has no single canonical upstream, so I flag it as a **community pattern**, grounded here on the primary scope/operator/profile semantics in Sections 1–3 rather than on any one blog.

**Tradeoff — per-file parse overhead vs one monolith.** Splitting into N files means N file opens + N parse passes instead of one. On Windows two costs matter: each `.ps1` open can trigger an AV/EDR scan-on-read, and each file is parsed separately. But per `docs/pwsh-lazy-load-tool-inits.md`, the dominant startup cost in this profile is **process spawn + scan-on-execute**, paid once per `& tool` call — and the split changes none of those spawns. Reading ~12 small local `.ps1` files is cheap next to eight binary spawns, so the isolation/ordering win comfortably outweighs the added parse cost. If the file-open cost ever does show up under a pathological AV config, the mitigation is the same as for the spawns: a Microsoft Defender exclusion for the profile directory (see the sibling note's "Root-cause first" recommendation), not re-merging into a monolith.

---

## 5. Deferred / lazy hooks inside a module file

Deferral (running a slow init after the prompt is already interactive, or behind first-use) composes cleanly with the modular layout — a module file is just a normal script dot-sourced into global scope, so anything the monolith could register, a module can register. The mechanics are covered in depth in **`docs/pwsh-lazy-load-tool-inits.md`**; this section only notes how they slot into a per-module file.

- **Self-replacing stub functions** (sibling §1): a deferred tool becomes a module whose entire body is the stub, e.g. `085-fnox.ps1` contains just the `function fnox { … }` stub instead of an eager `fnox activate pwsh`. Because the module is dot-sourced into global scope (Section 1 here), the stub is defined globally and persists — no `Global:` modifier needed on the `function` keyword, though the init the stub later runs should still define into global scope as the sibling note describes. Keep the stub a **simple function** (no `[CmdletBinding()]`) so `@args` forwarding works (sibling §1).

- **One-shot OnIdle deferral** (sibling §2a): a module can register `Register-EngineEvent -SourceIdentifier PowerShell.OnIdle -MaxTriggerCount 1 -Action { … }` to run its slow work once, after the shell goes idle, in the interactive runspace. The registration runs at load time in global scope, so it behaves exactly as it would in the monolith. This is the safe deferral for work that must touch the interactive session (including keybindings), per the sibling note. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent

**What must NOT be deferred, and therefore stays an eager module:** any keybinding/prompt init — `atuin`, `tv`, `carapace`, `oh-my-posh` — because a keypress has no "first use" that could trigger a lazy load, and their relative bind order is load-bearing (Section 3). Per the sibling note's verdict table, only **`pay-respects`** (the typed `f` command) and **`fnox`** (secrets on `cd`, no keys/aliases) are safe to render as deferred/stub modules; the other six stay eager.

---

## Recommended layout for this repo

A `profile.d` directory beside the profile, holding chezmoi-rendered `.ps1` modules, loaded by a thin loader. Each module keeps the template variables it already uses (`{{ .pwsh.posh_theme }}`, `{{ .directories.mise_dir }}`), so the source files stay `*.ps1.tmpl` and render to plain `*.ps1` the loader enumerates.

### File list — mapped to the current profile's contents

| Module (`profile.d/…`) | From current profile lines | Eager / Deferred | Why the number |
|---|---|---|---|
| `000-path-heal.ps1` | relocation partial + env re-assert + PATH normalize (L4–38) | Eager | Nothing works without PATH; no spawn |
| `010-mise.ps1` | `mise activate pwsh` (L45–47) | Eager | Must precede every tool init (PATH for mise-managed binaries) |
| `015-psreadline.ps1` | `Import-Module PSReadLine` + prediction opts + base keybindings (L49–89) | Eager | Must precede all key-binders |
| `020-prompt-omp.ps1` | oh-my-posh init (L57–63) | Eager | Draws the prompt; binds no keys |
| `025-terminal-icons.ps1` | Terminal-Icons import (L67–69) | Eager | Cosmetic; order-insensitive |
| `030-carapace.ps1` | carapace + `Tab` binding (L92–97) | Eager | Binds `Tab`; needs PSReadLine loaded |
| `040-zoxide.ps1` | zoxide direct-binary init (L99–109) | Eager | Defines `cd`/`z`; no keys |
| `050-television.ps1` | `tv init power-shell` (L111–117) | Eager | Binds `Ctrl+T`/`Ctrl+R`; **before atuin** |
| `055-atuin.ps1` | `atuin init powershell` (L119–122) | Eager | Binds `Ctrl+R`; **after tv so it wins** |
| `080-pay-respects.ps1` | `pay-respects pwsh --alias f` (L124–127) | **Deferred** (stub `f`) | Typed command; bind optional inline chord eagerly only if used |
| `085-fnox.ps1` | `fnox activate pwsh` (L129–133) | **Deferred** (stub) | No keys/aliases; keep eager only if on-`cd` auto-inject is required |
| `090-kanata.ps1` | kanata toggle functions (L143–193) | Eager | Cheap, `Test-Path`-guarded; order-insensitive |
| `095-psmux.ps1` | psmux `t`/`ta`/`tn`/… functions (L199–237) | Eager | Function defs only; order-insensitive |

Numbering keeps the four hard constraints from Section 3 intact by construction: `010-mise` < everything; `015-psreadline` < `030/050/055`; `050-television` < `055-atuin`.

### The thin loader (`Microsoft.PowerShell_profile.ps1.tmpl`)

Keep the outer chezmoi guard (`{{ if and (eq .chezmoi.os "windows") .dev_computer }}`) on the loader; the modules inherit it by only being rendered on the same machines.

```powershell
# Thin loader: dot-source ordered modules from profile.d, isolating each.
$moduleDir = Join-Path (Split-Path -Parent $PROFILE.CurrentUserCurrentHost) 'profile.d'
if (Test-Path -LiteralPath $moduleDir) {
    $prevEAP = $ErrorActionPreference
    foreach ($module in Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' | Sort-Object Name) {
        try {
            $ErrorActionPreference = 'Stop'   # soft failures inside a module become catchable
            . $module.FullName                # dot-source: definitions land in the session (global) scope
        } catch {
            Write-Warning "profile module '$($module.Name)' failed: $($_.Exception.Message)"
        } finally {
            $ErrorActionPreference = $prevEAP # restore for the interactive session
        }
    }
}
```

Why each piece, tied to the sources:
- **`. $module.FullName`** (not `& …`): the loader runs in global scope, so dot-sourcing puts each module's functions/aliases/keybindings/`Invoke-Expression` output into the live session; `&` would run them in a disposable child scope and lose the non-`Global:` ones (§1 — about_Operators, about_Scopes).
- **`Sort-Object Name`**: `Get-ChildItem`/​.NET give no ordering guarantee, so ordering is made explicit; zero-padded ASCII prefixes sort deterministically across cultures (§3 — Get-ChildItem ref, Directory.GetFiles remarks).
- **`try/catch` per module**: a throwing or unparsable module is a terminating error, caught here, logged with its filename via `Write-Warning`, and the loop continues to the next module — the cascade the monolith suffers is broken (§2 — about_Try_Catch_Finally).
- **`$ErrorActionPreference = 'Stop'` scoped by `finally`**: makes a module stop at its first soft failure instead of emitting confusing follow-on errors, without leaking `Stop` into the interactive session (§2 — about_Preference_Variables; finally always restores).

### Eager vs deferred summary

- **Eager (11 modules):** everything that draws the prompt, binds a key, or sets PATH/`cd` behavior the rest of the session depends on — `000` through `055`, plus the pure-function modules `090`/`095`. Their order is fixed by the numeric prefixes.
- **Deferred (2 modules):** `080-pay-respects` (stub on the typed `f`) and `085-fnox` (stub on the `fnox` command), following the verdict table in `docs/pwsh-lazy-load-tool-inits.md`. If a fuller deferral is wanted, wrap the slow body in a one-shot `Register-EngineEvent … PowerShell.OnIdle -MaxTriggerCount 1` inside the module (§5).

The net effect: the same eight inits run in the same load-bearing order, but a starved cold spawn in, say, `030-carapace` now logs `profile module '030-carapace.ps1' failed: …` and the shell still reaches `050-television` and `055-atuin` — "no atuin or anything" becomes "carapace missing, everything else fine."
