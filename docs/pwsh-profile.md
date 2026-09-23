# PowerShell profile (Design doc)

Scope: the Windows pwsh profile, `home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`. It covers the current layout, then a proposed split into ordered fragments with per-fragment error isolation and deferral of the inits that are safe to defer.

## Current state

The profile is a single template, rendered only when `chezmoi.os == "windows"` and `.dev_computer` is set. A separate OneDrive profile sources it. It has no `profile.d` directory and no loader. Every tool init runs eagerly, top to bottom, in this order:

1. The `windows-relocation` partial (`Get-NormalizedPath`), re-assertion of the relocated User-scope env vars, and PATH normalization (WinGet Links, mise shims, pnpm, WinLibs). None of these spawns a process.
2. `mise activate pwsh`.
3. `Import-Module PSReadLine`.
4. `oh-my-posh init pwsh`, then `Terminal-Icons`, the PSReadLine prediction options (inside `try/catch`, because a non-VT host throws), and the base key handlers.
5. `carapace _carapace` (binds `Tab`).
6. `zoxide init powershell`, run on the real binary rather than the mise shim.
7. `tv init power-shell`, then `atuin init powershell`.
8. `pay-respects pwsh --alias f` and `fnox activate pwsh`.
9. The kanata toggle functions, gated on `Test-Path` of the scoop shim instead of `Get-Command`, which would scan all of PATH.
10. The psmux `t`/`ta`/`tn`/... functions.

That makes eight external `tool init | Invoke-Expression` spawns on every start. Nothing is deferred. No Defender exclusion is configured anywhere in the repo.

Two changes to startup cost are already in place: zoxide resolves to its real binary, and kanata uses a direct `Test-Path` probe.

## Problems

- **Startup cost.** On Windows each spawn pays process creation plus a Defender/EDR scan when the binary executes. That cost dominates startup, and this profile pays it eight times. Script parsing is small next to it.
- **Cascade on failure.** A terminating error partway through the file, such as a cold spawn starved under heavy AV load, stops everything after it. One failed init can silently take out atuin and all the setup that follows.

## Ordering contract

Any restructuring must keep this relative order:

1. **PATH heal and `mise activate` come first.** On Windows most mise-managed tools only reach PATH through `activate`. If a later init can't find its binary, it silently skips.
2. **PSReadLine is imported before any init that binds keys.** Without it, atuin and tv bail with "requires the PSReadLine module".
3. **tv runs before atuin.** Both bind `Ctrl+R` and the last binding wins. tv's init always emits `Set-PSReadLineKeyHandler` for `Ctrl+T` and `Ctrl+R`, whatever its config says, so atuin has to bind after it to own `Ctrl+R`. `Ctrl+T` stays with tv. Sources: [tv shell_integration.rs](https://github.com/alexpasmantier/television/blob/main/television/config/shell_integration.rs), [atuin init](https://docs.atuin.sh/main/reference/init/).
4. **carapace binds `Tab`** to `MenuComplete`, and that binding has to exist at startup ([carapace setup](https://carapace-sh.github.io/carapace-bin/setup.html)).

## Which inits to defer

A keypress can't trigger a lazy load, so any init that binds keys or draws the prompt must run eagerly.

| Init | Needed at first prompt? | Decision |
|---|---|---|
| mise | Yes. It sets PATH for other tools and installs a per-prompt hook. | Eager |
| oh-my-posh | Yes. It draws the prompt. | Eager |
| carapace | Yes. It binds `Tab`. | Eager |
| zoxide | Yes. It defines `z` and hooks the prompt. | Eager |
| tv | Yes. It binds `Ctrl+T` and `Ctrl+R` unconditionally. | Eager, before atuin |
| atuin | Yes. It binds `Ctrl+R`. | Eager, after tv |
| pay-respects | No. `f` is a typed function. | Defer with a stub `f` |
| fnox | Only for secret auto-loading on `cd`. It binds no keys and defines no aliases. | Defer with a stub `fnox` |

Caveats on the two deferrals:

- **pay-respects.** Its init also binds `Ctrl+X,Ctrl+X` for the experimental inline correction ([init.ps1](https://github.com/iffse/pay-respects/blob/main/core/templates/init.ps1)). Deferring the init delays that chord too. If the chord is used, bind it eagerly and leave only `f` behind the stub.
- **fnox.** `activate pwsh` installs only a prompt hook that loads and unloads secrets as the working directory changes ([fnox shell integration](https://fnox.jdx.dev/guide/shell-integration.html)). A stub delays auto-injection until the first explicit `fnox` call. Keep fnox eager if that auto-loading is relied on. fnox 1.21.0 or later is required for pwsh.

These tools have no endorsed static or cached init:

- **mise** has no documented way to capture `activate` output. Its `hook-env` has an internal fast path and an optional `env_cache` ([cache behavior](https://mise.jdx.dev/cache-behavior.html)).
- **atuin** and **carapace** have no file-cache option for pwsh.
- **oh-my-posh** can print its init script to a file. Its maintainer attributes slow init to the machine, for example Defender scanning the binaries, rather than to the init itself ([discussion 5417](https://github.com/JanDeDobbeleer/oh-my-posh/discussions/5417)).

## Deferral mechanisms

### Self-replacing stub (chosen)

```powershell
# Simple function: [CmdletBinding()] would remove $args and break @args.
function fnox {
    Remove-Item Function:\fnox
    (& (Get-Command fnox -CommandType Application) activate pwsh) | Out-String | Invoke-Expression
    & fnox @args
}
```

- The stub removes itself with `Remove-Item Function:\<name>` before it re-dispatches, so the `& <name> @args` call can't re-enter the stub, even when the init doesn't define a function with the same name ([about_Function_Provider](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_function_provider)).
- `@args` forwards every argument, but only from a simple function. Declaring `[CmdletBinding()]` or `[Parameter()]` removes `$args` ([about_Splatting](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_splatting)).
- `Get-Command -CommandType Application` resolves the real executable, so the init never runs through the stub.
- The `pay-respects` stub has the same shape: it is named `f` and runs `pay-respects pwsh --alias f`.

### One-shot OnIdle (for heavier deferral)

Use this for slow work that has to change the interactive session, including key bindings:

```powershell
Register-EngineEvent -SourceIdentifier PowerShell.OnIdle -MaxTriggerCount 1 -Action { ... }
```

The action runs once, in the interactive runspace, after 300 ms of idle. From PSReadLine 2.2.0-beta4 on, it fires only when the edit buffer is empty ([Register-EngineEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent)).

Don't use `Start-Job` or `Start-ThreadJob` for inits. A job runs in its own runspace, so the functions, env vars, and key handlers it sets never reach the session. `fsackur/ProfileAsync` gets around that with reflection, but its own README warns that the session may crash.

## Proposed layout

A `profile.d/` directory sits next to the profile. Its fragment sources are `*.ps1.tmpl`, rendered on the same machines as the loader and keeping the template variables they already use. The numeric prefixes encode the ordering contract, and the gaps between them leave room to insert new fragments.

| Fragment | Content | Mode |
|---|---|---|
| `000-path-heal` | Relocation partial, env re-assertion, PATH normalization | Eager |
| `010-mise` | `mise activate pwsh` | Eager |
| `015-psreadline` | PSReadLine import, prediction options, base key handlers | Eager |
| `020-prompt-omp` | oh-my-posh | Eager |
| `025-terminal-icons` | Terminal-Icons | Eager |
| `030-carapace` | carapace and the `Tab` binding | Eager |
| `040-zoxide` | zoxide, initialized on the real binary | Eager |
| `050-television` | `tv init power-shell` | Eager |
| `055-atuin` | `atuin init powershell` | Eager |
| `080-pay-respects` | Stub `f` | Deferred |
| `085-fnox` | Stub `fnox` | Deferred |
| `090-kanata` | kanata toggle functions | Eager |
| `095-psmux` | psmux helper functions | Eager |

### Loader

The profile template shrinks to the chezmoi guard plus this loop:

```powershell
$moduleDir = Join-Path (Split-Path -Parent $PROFILE.CurrentUserCurrentHost) 'profile.d'
if (Test-Path -LiteralPath $moduleDir) {
    $prevEAP = $ErrorActionPreference
    foreach ($module in Get-ChildItem -LiteralPath $moduleDir -Filter '*.ps1' | Sort-Object Name) {
        try {
            $ErrorActionPreference = 'Stop'
            . $module.FullName
        } catch {
            Write-Warning "profile module '$($module.Name)' failed: $($_.Exception.Message)"
        } finally {
            $ErrorActionPreference = $prevEAP
        }
    }
}
```

- **Wrap each fragment in its own `try/catch`.** A bare dot-source loop, like the zsh `shell-loader.sh`, has no error isolation: a terminating error in one fragment ends the loop. `try/catch` catches both statement-terminating and script-terminating errors, including parse errors in a dot-sourced file ([about_Try_Catch_Finally](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally)). A failing `030-carapace` then logs a warning, and `050-television` and `055-atuin` still load.
- **Set `$ErrorActionPreference = 'Stop'` for each fragment and restore it in `finally`.** This makes a non-terminating error stop its fragment at the first failure. The fragment is dot-sourced into global scope, so if the loader didn't restore the preference, `Stop` would leak into the interactive session ([about_Preference_Variables](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables)). A fragment that emits a harmless `Write-Error` can set its own preference back to `Continue`.
- **Use `foreach`, not `ForEach-Object`.** Inside `catch`, `$_` becomes the error record, so a `ForEach-Object` block can no longer name the file that failed.
- **Dot-source (`.`), never call (`&`).** Dot-sourcing runs the fragment in the current scope, which is global, so functions, variables, and `Invoke-Expression` output stay in the session. `&` runs the fragment in a child scope and drops every definition not marked `Global:` ([about_Scopes](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_scopes)).
- **Sort explicitly.** Neither `Get-ChildItem` nor the underlying .NET enumeration guarantees an order ([Directory.GetFiles](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.getfiles)). Zero-padded ASCII prefixes sort the same way in every culture.

`profile.d` is a local convention. PowerShell itself runs only the fixed profile files listed in [about_Profiles](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles).

## Cost and the Defender exclusion

Splitting the profile adds about 13 file opens and parse passes, and each open may trigger an AV scan-on-read. That is small next to the eight binary spawns, which the split doesn't change. The fix for spawn and scan cost is a Microsoft Defender exclusion covering the tool binaries, `pwsh.exe`, and `profile.d`.

**Put that exclusion in place before considering a merge back into one file.** If file-open cost shows up under a heavy AV configuration, it is the same scan cost the exclusion removes, not a reason to give up isolation. Before blaming any init's logic, measure the offending tool with its `--debug` or timing output, for example `oh-my-posh init pwsh --debug`.

## Open work

- Set up the Defender exclusion. No repo script manages one yet.
- Create `profile.d/` and reduce the profile to the loader.
- Convert `pay-respects` and `fnox` to stubs, after deciding whether fnox's secret auto-loading on `cd` and the pay-respects inline chord are used.
