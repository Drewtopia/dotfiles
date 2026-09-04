# PowerShell 7 Lazy-Loading of Shell Tool Integrations

> **Type:** Reference (research note)
> **Date:** 2026-08-27
> **Scope:** Reducing pwsh `$PROFILE` cold-start on Windows by deferring tool inits that aren't needed at prompt-draw.
> **Subject profile:** `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`

On Windows every binary spawn is expensive (process-creation cost plus Defender/EDR scan-on-execute), so a profile that eagerly runs ~8 external `& tool init | Invoke-Expression` calls pays that cost 8x at every shell start. This note captures, against primary sources, which of those inits can be deferred behind first-use and how to do it safely.

The 8 eager inits in the current profile: `mise activate`, `oh-my-posh`, `atuin`, `carapace`, `zoxide`, `television`/`tv`, `pay-respects`, `fnox`.

---

## Table of Contents

- [1. Self-replacing stub function idiom](#1-self-replacing-stub-function-idiom)
- [2. Deferred / async $PROFILE load](#2-deferred--async-profile-load)
- [3. Per-tool defer-safety](#3-per-tool-defer-safety)
- [4. Faster / static / cached init modes](#4-faster--static--cached-init-modes)
- [Recommendation for this profile](#recommendation-for-this-profile)

---

## 1. Self-replacing stub function idiom

The idea: instead of running `tool init | Invoke-Expression` eagerly, define a lightweight **stub function** with the tool's command name. On first invocation the stub runs the real init (which defines the real command), removes/overwrites itself, then re-dispatches the call to the now-real command. Startup pays nothing; the first use pays the init cost once.

### The mechanics

- PowerShell exposes every function through the built-in **Function provider** on the `Function:` drive; each entry is a `System.Management.Automation.FunctionInfo`. This is what makes a function addressable as a path. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_providers
- A function removes itself by name via the provider: `Remove-Item Function:\<name>` (equivalently `Remove-Item Function:<name>`). This is the mechanism a stub uses to delete itself. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_function_provider
- A function can instead be overwritten in place with `Set-Item -Path Function:<name> -Value { ... }`, so an init routine that emits a global `function <name> { ... }` (or `Set-Item Function:\Global:<name>`) clobbers the stub at its provider path. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_function_provider
- A stub must **not** be `Constant` (constant functions cannot be deleted or overwritten); `ReadOnly` functions need `-Force` to change but can still be removed. A plain `function` declaration is neither, so it is safe to self-replace. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_function_provider

### Argument forwarding with `@args`

- `@args` is the splatting form of the automatic `$args` variable. `function Get-MyProcess { Get-Process @args }` forwards **all** unassigned positional and named parameters to the wrapped command, and keeps working even if the target's parameters change. This is the exact re-dispatch mechanism a stub uses. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_splatting
- `about_Functions` documents the same proxy pattern (`function Get-MyCommand { Get-Command @args }`), where `@args` "represents undeclared cmdlet parameters and values from remaining arguments." — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_functions
- **Critical constraint:** turning the function into an *advanced* function via `[CmdletBinding()]` or `[Parameter()]` removes the `$args` automatic variable. A self-replacing stub that forwards via `@args` must therefore stay a **simple function** (no `CmdletBinding`). — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_splatting (Notes)

### Scope

- A function created without a scope modifier lives only in its creating scope and vanishes when that scope exits. Init output (and stub definitions) meant to persist for the session must land in **global** scope (`function Global:<name>` / `Set-Item Function:\Global:<name>`). This is also why `tool init | Invoke-Expression` output is written as global definitions. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_functions

### Avoiding infinite recursion

Recursion avoidance is not a special feature — it follows from the provider semantics above. On first call the stub must ensure the name no longer points at itself before (or by) re-dispatching. Two documented ways:

1. **Let init overwrite the stub.** If `tool init | Invoke-Expression` emits a global `function <name>` / `Set-Item Function:<name>`, it replaces the `FunctionInfo` at that path, so `& <name> @args` afterward hits the real command. (Synthesized from the `Set-Item`/overwrite semantics above; no single Microsoft page names this as a pattern.)
2. **Have the stub delete itself first.** Call `Remove-Item Function:\<name>` before `& <name> @args`. Use this when the tool's init does *not* define a same-named command (e.g. it only sets env vars, a prompt hook, or keybindings) — otherwise the re-dispatch would re-enter the stub.

Provider-native readiness check: `Test-Path Function:\<name>` / `Get-Item Function:\<name>` tells you whether the stub is still the thing bound to that name. (An `$ExecutionContext.InvokeCommand.GetCommand(...)`-based guard appears in community code but is **not** Microsoft-documented as part of this idiom — treat it as unverified.)

### Canonical stub skeleton

```powershell
# Simple function (NO [CmdletBinding]) so @args stays available.
function fnox {
    Remove-Item Function:\fnox            # stop pointing at the stub first
    (& (Get-Command fnox -CommandType Application) activate pwsh) |
        Out-String | Invoke-Expression   # real init runs once
    & fnox @args                          # re-dispatch the original call
}
```

Because `Remove-Item Function:\fnox` runs before the re-dispatch, the trailing `& fnox @args` resolves to the real `fnox.exe` (or whatever the init defined), never back into the stub.

---

## 2. Deferred / async `$PROFILE` load

Distinct from per-command stubs: run the slow init work in the background **after** the profile returns / after the first prompt, so the shell becomes interactive immediately. Three documented options, increasing in power and risk.

### (a) One-shot OnIdle hook — lowest risk

- `Register-EngineEvent -SourceIdentifier PowerShell.OnIdle` (or `[System.Management.Automation.PSEngineEvent]::OnIdle`) subscribes to the engine idle event; with an `-Action` scriptblock it becomes a deferred hook. The engine's only supported `PSEngineEvent` values are `PowerShell.Exiting` and `PowerShell.OnIdle`. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent
- `-MaxTriggerCount 1` makes it a true **one-shot** — run the deferred load once, then the subscription stops. (Otherwise call `Unregister-Event` inside the action.) — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent
- The engine is "idle" when not running a pipeline; OnIdle fires after **300 ms** of idle. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent (Notes)
- **Pitfall (Microsoft-documented):** with PSReadLine, OnIdle fires when `ReadKey()` times out (no typing for 300 ms), so it can fire *mid-edit* while the user is reading help. **Beginning in PSReadLine 2.2.0-beta4**, OnIdle only signals if there is a `ReadKey()` timeout **and** the editing buffer is empty. So exactly when an OnIdle-scheduled load runs depends on the PSReadLine version and whether the user is typing. — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent (Notes)
- Because the OnIdle `-Action` runs in the **interactive** runspace, it is a safe place to call `Set-PSReadLineKeyHandler` (unlike a detached job — see below).

### (b) Background thread job — for independent slow work

- `Start-ThreadJob` (module `ThreadJob`) runs a background job in a separate **thread within the same process** (not a child process like `Start-Job`), using the caller's working directory. — https://learn.microsoft.com/en-us/powershell/module/threadjob/start-threadjob
- It spins up ~8x faster than `Start-Job` (≈0.6 s vs ≈4.8 s for five jobs in the doc's example); default `-ThrottleLimit` is 5. — https://learn.microsoft.com/en-us/powershell/module/threadjob/start-threadjob
- **Limitation:** a thread/child job runs in its own runspace and **cannot mutate the interactive session's state** — key handlers, functions, aliases, and env vars set there do not appear in your prompt. Use it only for work whose *results you pull back later*, never to install prompt-facing integrations. — https://learn.microsoft.com/en-us/powershell/module/psreadline/set-psreadlinekeyhandler

### (c) Async profile into the live session — most power, most risk

- The canonical community "async profile" is **fsackur/ProfileAsync**, exporting `Import-ProfileAsync`. Fast code goes at the top of the profile; slow code is wrapped in a scriptblock passed to `Import-ProfileAsync` at the **bottom**. — https://github.com/fsackur/ProfileAsync
- Mechanism: it creates a second PowerShell instance with its own Runspace, injects the caller's `$ExecutionContext.SessionState` into a synthetic `[psmoduleinfo]` so the async scriptblock dot-sources into the caller's **global** scope, then `BeginInvoke()`s it; cleanup is driven by `Register-ObjectEvent` on `InvocationStateChanged`. Functions/modules/aliases/variables/argument-completers defined in the block land in the live session when it completes. — https://github.com/fsackur/ProfileAsync/blob/main/public/Import-ProfileAsync.ps1
- The scope-injection reflection technique is the SeeminglyScience "invocation operators, states, and scopes" trick. — https://seeminglyscience.github.io/powershell/2017/09/30/invocation-operators-states-and-scopes
- **Hard caveats from the project itself:** "This command uses reflection hacks… Your session may crash. Errors may be misleading. Do not use in server scripts." Use only in your profile, call it **once**, call it at the bottom, and increase `-Delay` (default 500 ms) if you get errors. — https://github.com/fsackur/ProfileAsync
- **PSReadLine race is real and acknowledged in the source:** the wrapper scriptblock carries the comment `# Runspace init is unsafe. Stack traces point to PSReadLine; not sure`. Background-runspace init collides with PSReadLine state. — https://github.com/fsackur/ProfileAsync/blob/main/public/Import-ProfileAsync.ps1

### Why keybindings resist backgrounding

- `Set-PSReadLineKeyHandler` customizes the **current** PSReadLine console session's handlers. PSReadLine state is per-console/interactive-session. — https://learn.microsoft.com/en-us/powershell/module/psreadline/set-psreadlinekeyhandler
- Running a scriptblock on a thread with no attached runspace throws `PSInvalidOperationException: There is no Runspace available to run scripts in this thread` — the failure mode for key-handler/callback code executed off the interactive runspace. — https://github.com/PowerShell/PowerShell/issues/11658
- **Net rule:** any `Set-PSReadLineKeyHandler` work must run in the interactive runspace — synchronously at profile time, or from an OnIdle action, or via ProfileAsync's SessionState injection — **never** from a plain `Start-Job`/`Start-ThreadJob`.

---

## 3. Per-tool defer-safety

### fnox — `fnox activate pwsh`

- fnox is jdx's encrypted/remote secrets manager (pairs with mise); shell integration auto-loads secrets from a `fnox.toml` when you `cd` into a directory. — https://github.com/jdx/fnox / https://fnox.jdx.dev/guide/shell-integration.html
- `activate pwsh` installs a **prompt hook only** — it runs `hook-env` on each prompt to set/unset env vars as you change directories, printing `fnox: +1 FOO` / `fnox: -1 FOO` diffs. It defines **no interactive keybindings and no user-facing aliases**. — https://fnox.jdx.dev/guide/shell-integration.html
- The hook fires on **every prompt**, not only on explicit fnox commands. — https://fnox.jdx.dev/guide/shell-integration.html
- pwsh (`pwsh`/`powershell`) support was **added in fnox v1.21.0**, tested on PowerShell 7.6 and Windows PowerShell 5.1 — so `activate pwsh` requires **fnox >= 1.21.0** (matches the profile's existing comment). — https://newreleases.io/project/github/jdx/fnox/release/v1.21.0
- **Verdict: SAFE to defer.** No interactive keybindings are lost by deferring. Caveat: deferring changes semantics — secrets stop auto-injecting on `cd` until the hook is installed. If fnox is used explicitly (`fnox exec -- <cmd>` / `fnox get`), the activate hook isn't needed at all, so a stub keyed on the `fnox` command name works cleanly.

### pay-respects — `pay-respects pwsh --alias f`

- A Rust `thefuck` replacement by **iffse** (repo `iffse/pay-respects`). `--alias` "defaults to `f`," so `--alias f` is the default. — https://github.com/iffse/pay-respects
- The pwsh init defines a PowerShell **function** named `f` whose body (`__pr_main suggest`) grabs the last history line and runs the correction. You invoke it by **typing `f` + Enter** — the alias is a function, not a keybinding; nothing runs at prompt-draw. — https://github.com/iffse/pay-respects/blob/main/core/templates/init.ps1
- The same init also binds **one** key unconditionally: `Set-PSReadLineKeyHandler -Chord Ctrl+x,Ctrl+x -ScriptBlock { __pr_inline }` for the experimental inline-correction mode. (A command-not-found hook block exists but is commented out by default.) — https://github.com/iffse/pay-respects/blob/main/core/templates/init.ps1
- **Verdict: SAFE to defer the `f` correction path** via a stub named `f`. Caveat: deferring the whole init also delays the `Ctrl+X,Ctrl+X` inline chord, which must be eager to be pressable. If only `f` is used, deferral is fully safe; if the experimental inline chord is used, bind just that one chord eagerly.

### television / tv — `tv init power-shell`

- A fast fuzzy finder by alexpasmantier; init installs smart autocomplete + history search. Exact command is `tv init power-shell` (hyphenated). — https://github.com/alexpasmantier/television / https://alexpasmantier.github.io/television/user-guide/shell-integration/
- The generated `completion.ps1` ends with **two unconditional** `Set-PSReadLineKeyHandler` calls — smart autocomplete (`Invoke-TvSmartAutocomplete`) and shell history (`Invoke-TvShellHistory`). — https://github.com/alexpasmantier/television/blob/main/television/utils/shell/completion.ps1
- Defaults are **Ctrl+T** (autocomplete) and **Ctrl+R** (history): `DEFAULT_KEYBINDINGS = [("smart_autocomplete", Ctrl('t')), ("command_history", Ctrl('r'))]`. — https://github.com/alexpasmantier/television/blob/main/television/config/shell_integration.rs
- It binds Ctrl+R **even when keybindings are configured off**: the substitution falls back to hardcoded `'R'`/`'T'` when the config key is absent, and the template always emits `Set-PSReadLineKeyHandler`. There is no code path that omits the binding. — https://github.com/alexpasmantier/television/blob/main/television/config/shell_integration.rs
- **Verdict: MUST STAY EAGER.** It binds interactive PSReadLine keys at source time and exposes no command whose first use would trigger a load — the keys must exist before the first prompt.

### Keybinding-order constraints (why atuin / tv / carapace must stay eager)

The current profile already encodes an init-order contract in its comments, and the source above explains why (`home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`):

- **carapace binds `Tab`** to `MenuComplete` and needs `Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete` present at startup for completion to work. — https://carapace-sh.github.io/carapace-bin/setup.html
- **tv binds `Ctrl+T` and `Ctrl+R` unconditionally** (above).
- **atuin binds `Ctrl+R`** by default. — https://docs.atuin.sh/main/reference/init/
- Both tv and atuin want `Ctrl+R`. **Last binder wins**, so the profile deliberately inits **tv before atuin** (comment: "Init runs BEFORE atuin… so atuin's Ctrl+R handler needs to bind last to win. Ctrl+T still goes to tv."). Deferring or reordering either would silently hand Ctrl+R to the wrong tool. — profile source; https://docs.atuin.sh/main/reference/init/
- All three set keybindings that must be present before the first prompt, and their **relative order is load-bearing**. Lazy-loading any of them would either lose the binding until first use (there is no first-use trigger for a keypress) or race the order. They **must stay eager**.
- Supporting constraint already in the profile: PSReadLine must be imported before these inits, or atuin/tv bail with "requires the PSReadLine module." — profile source.

---

## 4. Faster / static / cached init modes

Question per tool: can init be precomputed to a file and dot-sourced (regenerated only on version/config change) instead of spawning the binary every startup?

### mise

- `mise activate pwsh` installs a **per-prompt hook** that calls `mise hook-env`, re-evaluating the environment on each prompt draw and on directory change. — https://mise.jdx.dev/cli/activate.html
- `mise activate <shell> --shims` instead prepends the shims dir to PATH and installs **no** prompt hook, but the docs state it "does not support all the features of `mise activate`": env vars load only when a shim is actually invoked, and `cd`/`enter`/`leave` and `watch_files` hooks don't fire. — https://mise.jdx.dev/cli/activate.html / https://mise.jdx.dev/dev-tools/shims.html
- mise's own docs say you "probably [won't] notice a difference in performance… using shims vs `mise activate`." — https://mise.jdx.dev/dev-tools/shims.html
- mise solves startup cost **internally**, not via a captured init file: `hook-env` has a fast-path that skips loading the full config/toolset when the directory is unchanged, env vars weren't hand-modified, the TTL hasn't expired, and no watched config changed. — https://mise.jdx.dev/cache-behavior.html
- An optional on-disk env cache exists: `env_cache = true` (`env_cache_ttl` default 1h) caches the computed environment, invalidated when config/tool-versions/settings change, mise is upgraded, the TTL expires, or watched files change; directives can opt out with `cacheable = false`. — https://mise.jdx.dev/cache-behavior.html
- **Takeaway:** there is **no documented "capture `mise activate` output to a static file" workflow**, and hand-rolling one would freeze the per-directory hook logic mise depends on. Leave mise's activate eager; rely on its built-in fast-path/`env_cache` for speed. (mise's activate one-liner is also already the first thing the profile runs, because most mise-managed tools on Windows only get their PATH from `activate`.)

### oh-my-posh

- `oh-my-posh init pwsh --config <path>` prints the init script normally piped to `Invoke-Expression`; the init command supports a `--print` flag that emits the script as text, so it can be redirected to a file and dot-sourced. — https://github.com/JanDeDobbeleer/oh-my-posh/discussions/5417
- A community caching pattern regenerates the cached `.ps1` only when the config or the oh-my-posh binary is newer than the cache, else dot-sources the cache (reported ~51% startup reduction). This is a **third-party blog** pattern, not upstream docs. — https://ibnuhx.com/blog/cutting-powershell-startup-time-in-half
- **The maintainer does not endorse caching as the fix:** his position is that `oh-my-posh init pwsh` is fast, and if it's slow the cause is the machine (e.g. **Windows Defender scanning `pwsh.exe`**) — diagnose with `oh-my-posh init pwsh --debug` and add Defender exclusions. He also suggests bypassing `Invoke-Expression` via a `prompt` function that calls `oh-my-posh print primary --config ...`. — https://github.com/JanDeDobbeleer/oh-my-posh/discussions/5417
- **Takeaway:** caching to a file is mechanically possible and the win is real, but the maintainer treats the slowness as an environment problem. On a Defender/EDR-heavy Windows box, Defender exclusions for the tool binaries are the higher-leverage fix; a version-and-config-keyed cache is a valid secondary optimization if the mtime check also covers the config.

### atuin

- `atuin init powershell` prints the shell plugin; evaluating its output installs atuin's hooks and key bindings. Ctrl+R is bound by default; bindings can be disabled with `--disable-up-arrow`, `--disable-ctrl-r`, `--disable-ai`, or the `ATUIN_NOBIND` env var. — https://docs.atuin.sh/main/reference/init/
- **No caching-to-file story:** atuin's docs contain no `--print`/file-cache mechanism; the init is designed to be evaluated fresh each startup. — https://docs.atuin.sh/main/reference/init/

### carapace

- pwsh setup runs `carapace _carapace | Out-String | Invoke-Expression`, plus the required `Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete`. `CARAPACE_BRIDGES` (optional) enables fallthrough to other shells' completers. — https://carapace-sh.github.io/carapace-bin/setup.html
- **No documented file-cache for pwsh:** carapace's pwsh setup generates completions inline every startup. Notably carapace **does** document caching for **Nushell** (source a generated file), so the "cache to file" idea is upstream-blessed for Nushell but *not* for pwsh. — https://carapace-sh.github.io/carapace-bin/setup.html

### Cross-cutting

- The generic "capture init output to a file, dot-source it, regenerate only on binary/config change" pattern is **first-class only for oh-my-posh** (`--print`) among these four — and even there the maintainer discourages it in favor of fixing the real cause. atuin and carapace-pwsh have no such story; mise deliberately uses internal TTL caching instead. — https://github.com/JanDeDobbeleer/oh-my-posh/discussions/5417 / https://mise.jdx.dev/cache-behavior.html
- **Staleness tradeoff:** a file cache keyed only on binary mtime goes stale when config changes without a version bump (e.g. an oh-my-posh theme edit — the blog pattern handles this by also checking config mtime), when the tool's feature set changes, or when the init embeds machine/session-specific values. mise's TTL+auto-invalidation and atuin/carapace's evaluate-fresh approaches trade a little startup time for guaranteed freshness. — https://mise.jdx.dev/cache-behavior.html / https://ibnuhx.com/blog/cutting-powershell-startup-time-in-half

---

## Recommendation for this profile

**Root-cause first (highest leverage on Windows).** The dominant cost is process spawn + Defender/EDR scan-on-execute, paid per `& tool` call. Before any lazy-loading, add **Microsoft Defender exclusions** for the tool binaries and `pwsh.exe` — this is the maintainer-endorsed fix for oh-my-posh and applies to every spawn here (https://github.com/JanDeDobbeleer/oh-my-posh/discussions/5417). Diagnose individual offenders with each tool's `--debug`/timing before assuming init logic is the cost.

**Defer safety by tool:**

| Tool | At prompt-draw? | Binds interactive keys? | Recommendation |
|---|---|---|---|
| `mise activate` | Yes (per-prompt hook; also sets PATH for other tools) | No | **Eager** — must run first; use internal `env_cache`/fast-path for speed |
| `oh-my-posh` | Yes (draws the prompt) | No | **Eager**; optional `--print` version+config-keyed cache as a secondary win |
| `atuin` | No, but binds **Ctrl+R** | Yes | **Eager** — must bind last to win Ctrl+R |
| `television`/`tv` | No, but binds **Ctrl+T + Ctrl+R** | Yes (unconditional) | **Eager** — must init before atuin |
| `carapace` | No, but binds **Tab** | Yes | **Eager** |
| `zoxide` | No (defines `cd`/`z`; hooks prompt) | No | **Eager** (already optimized to skip the mise shim) |
| **`pay-respects`** | No (`f` is typed) | Only optional `Ctrl+X,Ctrl+X` inline chord | **Defer** the `f` path via stub; bind the inline chord eagerly only if used |
| **`fnox`** | Yes for auto-load (`cd` hook), but no keys/aliases | No | **Defer** via stub if fnox is used explicitly; keep eager only if on-`cd` auto-injection is required |

So of the 8: **`fnox` and `pay-respects` are the safe candidates to defer** (matching the task's goal). The other six must stay eager — the four keybinding/prompt tools (atuin, tv, carapace, oh-my-posh) because their keys/prompt must exist before the first prompt and their relative order is load-bearing, and mise/zoxide because they establish PATH and `cd` behavior the rest of the session relies on.

**Concrete stub pattern to use** (simple function, self-delete before re-dispatch, `@args` forwarding):

```powershell
# pay-respects: 'f' corrects the previous command; only runs when typed.
function f {
    Remove-Item Function:\f
    (& (Get-Command pay-respects -CommandType Application) pwsh --alias f) |
        Out-String | Invoke-Expression   # defines the real 'f'
    & f @args
}

# fnox: secrets manager; stub keyed on the binary name.
function fnox {
    Remove-Item Function:\fnox
    (& (Get-Command fnox -CommandType Application) activate pwsh) |
        Out-String | Invoke-Expression
    & fnox @args
}
```

Notes on the pattern:
- Keep both as **simple functions** — no `[CmdletBinding()]` — so `@args` stays available (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_splatting).
- `Remove-Item Function:\<name>` runs **before** the re-dispatch, so `& <name> @args` can't re-enter the stub (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_function_provider).
- Resolve the real binary with `Get-Command <name> -CommandType Application` so the stub never shadows the executable during init.
- `fnox`'s stub postpones on-`cd` secret auto-loading until first explicit fnox use — acceptable only if that auto-load isn't relied on; otherwise leave fnox eager.
- If a fuller deferral is ever wanted for genuinely prompt-independent work, prefer a **one-shot `Register-EngineEvent -SourceIdentifier PowerShell.OnIdle -MaxTriggerCount 1`** action (runs in the interactive runspace, safe for keybindings) over a background job, and reserve `fsackur/ProfileAsync` for cases that must define into the live global session — with its documented crash caveats in mind.
