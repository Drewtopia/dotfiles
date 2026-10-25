Reference — PowerShell cold start on managed Windows

# PowerShell cold start on managed Windows

Scope: why the Windows pwsh profile (`home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl`, design in `docs/pwsh-profile.md`) takes 5–28 s to start on a corporate-managed laptop, and which fixes work. Claims are cited to primary sources. Anything marked **measured** was observed on `<work-host>` on 2026-09-28 with read-only diagnostics. Anything marked **unverified** is inference.

## Environment

- PowerShell 7.6.6 (MSI), Windows 11 23H2 (build 22631), Microsoft Defender Antivirus platform 4.18.26080.4 with Defender for Endpoint, tamper protection on (**measured**, `Get-MpComputerStatus`).
- `$PROFILE` and the CurrentUser module path live in OneDrive-redirected Documents (`OneDrive - <org>\Documents\PowerShell`).
- mise is a winget install (`%LOCALAPPDATA%\Microsoft\WinGet\Packages\jdx.mise_…\mise\bin\mise.exe`). Tools live under `<tools-root>\.mise\installs`. oh-my-posh is a per-user install.

## Measurements

### Spawn cost per binary

`& <exe> --version`, timed with `Measure-Command` from `pwsh -NoProfile`. "Cold" is the first run after some idle time, "warm" is the runs that follow within seconds to minutes (**measured**).

| Binary | Size | Authenticode | Cold (ms) | Warm (ms) |
|---|---|---|---|---|
| `mise.exe` | 204.5 MiB | NotSigned | 2 483 | 383 – 1 178 (`hook-env`: 1 214 – 2 838) |
| `carapace.exe` | 86.3 MiB | NotSigned | 7 717 | 472 – 1 248 |
| `fnox.exe` | 48.1 MiB | NotSigned | 6 774 | 245 – 605 |
| `atuin.exe` | 37.5 MiB | NotSigned | 5 200 | 148 – 508 |
| `oh-my-posh.exe` | 19.5 MiB | **Valid** | 39 | 24 – 29 |
| `tv.exe` | 8.9 MiB | NotSigned | 184 | 70 – 230 |
| `pay-respects.exe` | 1.4 MiB | NotSigned | 55 | 25 – 61 |
| `zoxide.exe` (real binary) | 1.2 MiB | NotSigned | 28 | 23 – 45 |
| `zoxide.exe` (mise exe shim) | 0.25 MiB | NotSigned | 3 142 | 699 |
| `pwsh -NoProfile -c exit` | — | Valid | — | 322 – 377 |

The size of mise is upstream's, not a local oddity: the `mise-v2026.9.15-windows-x64.exe` release asset is 214 412 800 bytes ([release v2026.9.15](https://github.com/jdx/mise/releases/tag/v2026.9.15)).

Two patterns stand out:

- Cold spawn cost tracks the size of **unsigned** binaries. The signed 19.5 MiB oh-my-posh starts in 39 ms cold, while the unsigned 37–86 MiB binaries take 5–8 s. That signing or reputation causes the difference is **unverified**. Microsoft doesn't document how signatures affect real-time scan depth.
- mise stays expensive when warm. It costs 0.4–1.2 s per exec, `hook-env` included, and that cost recurs (see "Per-prompt spawns").

The cold-tab total of about 28 s matches the sum of the cold spawns on the startup path: `mise activate`, `mise hook-env`, carapace, atuin (twice, because its init runs `atuin uuid`), fnox `activate`, and fnox `hook-env`.

### Defender performance analyzer

`New-MpPerformanceRecording -Seconds 40` recorded while the spawns above ran, then `Get-MpPerformanceReport` (**measured**). The cmdlets need an elevated session and platform 4.18.2108.7 or later, and PowerShell 7 needs platform 4.18.2201.10 or later ([performance analyzer](https://learn.microsoft.com/en-us/defender-endpoint/tune-performance-defender-antivirus)). The SSH session on `<work-host>` holds an admin token, so the cmdlets ran there.

| File | Scans | Total | Max | Scan type |
|---|---|---|---|---|
| `mise.exe` | 7 | 11.9 s | 3.2 s | FileScan, every scan 1.4 s or more |
| `carapace.exe` | 4 | 6.5 s | 5.2 s | FileScan |
| `fnox.exe` | 3 | 5.6 s | 4.2 s | FileScan, plus a RealTimeScan OnOpen |
| `atuin.exe` | 3 | 4.2 s | 2.8 s | RealTimeScan OnOpen by `pwsh.exe` |
| `zoxide.exe` (shim) | 3 | 0.76 s | 0.65 s | FileScan |
| one process | 1 | 3.2 s | 3.2 s | OnDemandScan, reason `EDRSensor` |

Every scan reported `SkipReason = Not skipped`. The delay is local Defender content scanning of the executables. The evidence doesn't support network or cloud latency as the main cost.

### Defender and PowerShell policy on the host

All values **measured** with `Get-MpPreference`, the registry, and event logs.

| Setting | Value | Meaning |
|---|---|---|
| `MAPSReporting` / `SubmitSamplesConsent` / `DisableBlockAtFirstSeen` | 2 / 1 / False | Block at First Sight is on ([BAFS](https://learn.microsoft.com/en-us/defender-endpoint/configure-block-at-first-sight-microsoft-defender-antivirus)) |
| `CloudExtendedTimeout` | 10 | A cloud-held file can wait 10 + 10 = 20 s ([cloud block time-out](https://learn.microsoft.com/en-us/defender-endpoint/configure-cloud-block-timeout-period-microsoft-defender-antivirus)) |
| `PerformanceModeStatus` | 1 | Performance mode is **disabled** (`0` = enable, `1` = disable, per the [performance mode CSP table](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-endpoint-antivirus-performance-mode)) |
| ASR rule `01443614-cd74-433a-b99e-2ecdc07bfc25` | 0 (off) | The prevalence/age/trusted-list rule, which would gate every rarely seen exe, is off ([ASR rules reference](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference)) |
| `EnableControlledFolderAccess` | 2 (audit) | Event 1124 shows `pwsh.exe` "would have been blocked" writing under OneDrive `Documents\PowerShell` ([controlled folder access](https://learn.microsoft.com/en-us/defender-endpoint/enable-controlled-folders)) |
| Custom exclusions | none for these tools | Only built-in entries and one unrelated process exclusion |
| `HideExclusionsFromLocalUsers` | True | A non-admin user can't list exclusions |
| Script block logging GPO | Set under `…\Windows\PowerShell` only; no `…\PowerShellCore` key | Doesn't apply to pwsh 7 (see "Script evaluation, logging and AMSI") |

The tool binaries carry no `Zone.Identifier` stream (**measured**). BAFS uses its cloud check only for files "downloaded from the Internet, or that originate from the Internet zone" ([BAFS](https://learn.microsoft.com/en-us/defender-endpoint/configure-block-at-first-sight-microsoft-defender-antivirus)). That makes the 10–20 s cloud hold an unlikely cause here, though this is **unverified**, since the internal trigger logic isn't documented beyond that sentence.

## What causes the stall

1. **Real-time scanning of large unsigned PE files on each exec.** This is measured directly (see above). Microsoft doesn't publish the lifetime of the scan-result cache. `DisableCacheMaintenance` only says that an idle task maintains the cache ([Set-MpPreference](https://learn.microsoft.com/en-us/powershell/module/defender/set-mppreference)). The cold-to-warm drop fits a cache that expires after idle time, but the TTL is **unverified**. mise got no warm benefit in the recording: every one of its seven scans took 1.4 s or more.
2. **EDR on-demand scans.** A 3.2 s `EDRSensor` on-demand scan showed up during the burst. Defender AV exclusions don't cover EDR: "Files that you exclude can still trigger Endpoint Detection and Response (EDR) alerts" ([exclusions overview](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview)). Whether EDR adds latency on these specific binaries is **unverified**.
3. **Memory pressure.** About 3.7 GB is often free, and a daily scheduled quick scan ran for 1 h 25 m on the measurement day (events 1000/1001). Both could lengthen scans. This is **unverified** and wasn't isolated.

### Per-prompt spawns (not only startup)

The startup numbers hide a second cost. Several inits install hooks that exec a binary on every prompt or command (**measured** from each tool's init output):

| Hook | Binary | When |
|---|---|---|
| mise `_mise_hook`, run from `prompt` and on location change | `mise.exe hook-env -s pwsh` | Every prompt, except the one right after a `cd` that the chpwd handler already covered |
| fnox `_fnox_hook`, run from `prompt` | `fnox.exe hook-env -s pwsh` | Every prompt |
| atuin `PSConsoleHostReadLine` | `atuin history start` / `history end` | Every command |
| zoxide `__zoxide_hook` | `zoxide add` | On directory change |
| oh-my-posh | persistent `oh-my-posh serve` daemon | Once per session, not per prompt |

With mise at 0.4–1.2 s warm per exec, each prompt pays that cost on top of fnox. Caching init output can't remove any of these hooks.

## Script evaluation, logging and AMSI

- **Script block logging GPO doesn't reach pwsh 7 here.** pwsh 7 reads its own `PowerShell Core` policies. It honours the Windows PowerShell setting only when the Core policy's "Use Windows PowerShell Policy setting" is on ([about_Group_Policy_Settings](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_group_policy_settings)). No `PowerShellCore` key exists. In the last hour, `PowerShellCore/Operational` held 152 events 4104, all at level **Warning**, and zero invocation events 4105/4106 (**measured**). Warning-level 4104 events are PowerShell's automatic logging of script blocks "when they have content often used by malicious scripts", which runs without any policy ([PowerShell ♥ the Blue Team](https://devblogs.microsoft.com/powershell/powershell-the-blue-team/)). Invocation logging, which "generates a high volume of event logs" ([about_Group_Policy_Settings](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_group_policy_settings)), isn't active for pwsh 7.
- **AMSI scans every script block, however it arrives.** "PowerShell … passes all script blocks to AMSI", and 7.3+ also sends .NET method invocations ([PowerShell security features](https://learn.microsoft.com/en-us/powershell/scripting/security/security-features)). A cached `.ps1` that is dot-sourced goes through the same AMSI path as `Invoke-Expression`.
- **Measured evaluation cost** (parse, AMSI and auto-logging together, from `pwsh -NoProfile`):

| Init | Output size | Spawn (ms) | `Invoke-Expression` (ms) | Dot-source cached file (ms) |
|---|---|---|---|---|
| oh-my-posh | 54 KB | 148 – 221 | 431 – 717 | 371 – 492 |
| carapace | 82 KB | 1 189 – 1 248 | 192 – 195 | 227 – 269 |
| tv | 21 KB | 214 – 230 | 16 – 120 | 53 – 111 |
| zoxide | 4 KB | 40 – 45 | 23 – 80 | 12 – 104 |
| pay-respects | 2 KB | 53 – 61 | 3 – 43 | 7 – 80 |

Dot-sourcing a cached file is not cheaper than `Invoke-Expression`. Script evaluation of all the static inits totals under about 1.2 s. Spawns dominate. AMSI's share of the evaluation time wasn't isolated (**unverified**).

## Caching init output

The idea is to write each `tool init` output to a file once and dot-source the file at startup, which skips the spawn.

### Per tool

Based on each tool's actual output on `<work-host>` (**measured**) and its docs:

| Tool | Output is | Embeds | Safe to cache? |
|---|---|---|---|
| mise `activate pwsh` | Session-specific | The full current `PATH` as `__MISE_ORIG_PATH`, the absolute `mise.exe` path, and a per-session `__MISE_ENV_CACHE_KEY`. The key is a session key for mise's encrypted env cache, and child processes inherit it ([mise settings: env_cache](https://mise.jdx.dev/configuration/settings.html)) | **No.** A cached copy would restore a stale PATH and share one session key across shells. mise documents only live `(&mise activate pwsh) \| Out-String \| Invoke-Expression` ([mise activate](https://mise.jdx.dev/cli/activate.html)) |
| oh-my-posh `init pwsh` | Already file-cached by oh-my-posh | A fresh `POSH_SESSION_ID` per call, followed by `& '<cache>\init.<hash>.ps1'`, a file oh-my-posh writes itself. `--eval` inlines the script instead and is documented as slower ([oh-my-posh prompt setup](https://ohmyposh.dev/docs/installation/prompt)) | **No gain.** The 30–200 ms spawn exists to mint the session ID. Caching it would give every shell the same session ID and per-session cache file (`pwsh.<id>.omp.cache`) |
| carapace `_carapace` | Mostly static | One `Register-ArgumentCompleter` per completer carapace knows, which changes with carapace upgrades and `CARAPACE_BRIDGES` ([carapace setup](https://carapace-sh.github.io/carapace-bin/setup.html)) | Technically yes, but the completer execs `carapace` on every Tab, so the 86 MiB cold scan moves to the first Tab instead of disappearing |
| zoxide `init powershell` | Static | Calls `zoxide` by name; flags only ([zoxide](https://github.com/ajeetdsouza/zoxide)) | Yes. It saves only 25–45 ms, and `zoxide add` still runs per `cd` |
| tv `init power-shell` | Static | Key handlers plus a completion script | Yes. It saves about 70–230 ms |
| atuin `init powershell` | Session state computed at runtime | Runs `$env:ATUIN_SESSION = atuin uuid` at load, and `history start`/`end` per command ([atuin init](https://docs.atuin.sh/main/reference/init/)) | Pointless. The cached script still execs atuin during startup |
| pay-respects `pwsh --alias f` | Static text | The absolute versioned path `…\installs\aqua-iffse-pay-respects\0.8.8\pay-respects.exe` | Breaks after an upgrade plus `mise prune`. Saves about 50 ms |
| fnox `activate pwsh` | Static text | The absolute versioned path `…\installs\fnox\1.35.3\…\fnox.exe`. It installs a prompt hook and runs `_fnox_hook` (an exec) immediately ([fnox shell integration](https://fnox.jdx.dev/guide/shell-integration.html)) | **No gain.** The fnox exec still happens at the first prompt, and the cached path breaks on upgrade |

### Failure modes of caching

1. **Stale after an upgrade.** Output that embeds versioned install paths (fnox, pay-respects) points at a deleted directory once mise prunes the old version, and the hook fails on every prompt. Widely used prior art doesn't guard against this. `evalcache` keys its cache on an MD5 of the command-line string (plus the function body if the command is a shell function), never on the binary's version or mtime, and leaves invalidation to a manual `_evalcache_clear` ([evalcache.plugin.zsh](https://github.com/mroth/evalcache/blob/master/evalcache.plugin.zsh)).
2. **Stale after config or env changes.** carapace's completer list depends on `CARAPACE_BRIDGES` and on the carapace version. mise's output depends on PATH at generation time.
3. **Frozen per-session identity.** oh-my-posh `POSH_SESSION_ID` and mise `__MISE_ENV_CACHE_KEY` are meant to be unique per shell.
4. **Cache location.** Under OneDrive Documents, the cache file syncs across machines with different paths. Writes there are already audited by Controlled Folder Access, and if CFA moved from audit to block, cache writes from `pwsh.exe` would fail (**measured**: event 1124 for `pwsh.exe` on `Documents\PowerShell\Modules`). A cache under `%LOCALAPPDATA%` avoids both problems.
5. **No saving on evaluation.** AMSI and auto-logging still process the cached script, so only the spawn is saved (see the evaluation table).
6. **Cost moves instead of vanishing.** carapace (per Tab), atuin (per command), fnox and mise (per prompt) exec their binary anyway. Skipping the init spawn only moves the first cold scan to a later keystroke.

**Verdict:** the doubt about caching is justified. Of the eight inits, only tv, zoxide and carapace are safe to cache, and together they save about 0.3–1.5 s warm. In the cold case, carapace's 7.7 s moves to the first Tab rather than going away. mise and oh-my-posh must not be cached, and caching fnox and atuin saves nothing.

## Alternatives

### Defender exclusions (needs IT)

- **Exclusion type.** A *file* exclusion on each binary's full path. A process exclusion is the wrong tool: it "tell[s] Microsoft Defender Antivirus to skip the files that the process opens", and "to exclude the process's executable file itself, add a separate file and folder exclusion for it" ([exclusions overview](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview)). A process exclusion also switches off network protection and ASR for that process. Never ask for `pwsh.exe`: `powershell.exe` and `system.management.automation.dll` are on Microsoft's do-not-exclude list ([exclusions to avoid](https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-exclusions-common-mistakes)).
- **Narrowest form.** A contextual file exclusion limited to on-access scans, for example `<path>\mise.exe\:{PathType:file,ScanTrigger:OnAccess}`. Contextual exclusions need platform 4.18.2205.7 or later ([contextual exclusions](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview#contextual-exclusions)). On-demand and scheduled scans still cover the file.
- **Trade-off Microsoft states.** "Every exclusion is a protection gap". Microsoft says not to exclude `C:\Users\*` broadly, and to prefer [custom indicators](https://learn.microsoft.com/en-us/defender-endpoint/indicator-file) first ([exclusions overview](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview)). The binaries sit in user-writable folders, so anything running as the user could replace an excluded file. A tools directory that only admins can write shrinks that risk, but mise's per-user install layout doesn't allow one. Environment variables in exclusions resolve as LocalSystem, so `%LOCALAPPDATA%` doesn't point at the user's folder. Use literal paths.
- **Custom "allow" indicators** (by SHA-256 or signing certificate) override block verdicts in the policy-conflict order ([file indicators](https://learn.microsoft.com/en-us/defender-endpoint/indicator-file)). Whether an allow indicator skips the *scan*, and so saves time, is **unverified**; Microsoft documents only the verdict precedence. Hash indicators also go stale on every tool upgrade.
- **What a local admin can do.** Local admin exclusions merge with managed ones by default ([exclusions overview](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview)), and `DisableLocalAdminMerge` is unset here. So the account on `<work-host>` could technically add them. On a managed device that is a policy decision for IT, not a workaround to apply alone.

### Dev Drive with performance mode (needs IT)

A trusted Dev Drive runs real-time protection asynchronously: "open now, scan later" ([performance mode](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-endpoint-antivirus-performance-mode)). Three things rule it out here:

- `PerformanceModeStatus` is `1` (disabled) by policy.
- Microsoft recommends Dev Drive for source, package caches and build output, not for installing applications or tools ([Dev Drive](https://learn.microsoft.com/en-us/windows/dev-drive/)).
- In enterprises, "your security administrator will need to Configure Dev Drive security policy" ([Dev Drive](https://learn.microsoft.com/en-us/windows/dev-drive/)).

It is worth raising with IT only as a better-than-exclusion option for repos and caches.

### Deferring inits with OnIdle (user alone)

`Register-EngineEvent PowerShell.OnIdle -MaxTriggerCount 1` runs once in the interactive runspace after 300 ms of idle ([Register-EngineEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-engineevent)). The action runs on the pipeline thread, so input is blocked while a slow init runs. The prompt appears sooner, but the first keystrokes can still stall until the deferred work finishes (**unverified** for PSReadLine's exact buffering).

Two changes are available beyond `docs/pwsh-profile.md`:

- **carapace.** `Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete` is pure PSReadLine and can stay eager. Only `carapace _carapace` (completer registration) needs deferring. Tab works with native completion until OnIdle fires.
- **fnox.** Deferring `fnox activate pwsh` to OnIdle keeps secret auto-loading live from the first idle onward, instead of the design doc's stub, which activates only on the first explicit `fnox` call.

### Fewer or smaller binaries (user alone)

The spawn cost follows the unsigned byte count: mise 204 MiB, carapace 86 MiB, fnox 48 MiB, atuin 37 MiB.

- **atuin.** Dropping atuin in favour of tv's Ctrl+R or PSReadLine history removes one 37 MiB binary on the startup path and on every command.
- **mise.** `mise activate --shims` removes the per-prompt `hook-env` ([mise activate](https://mise.jdx.dev/cli/activate.html)). But each exe shim re-runs mise ([mise settings: windows_shim_mode](https://mise.jdx.dev/configuration/settings.html)), measured at 3.1 s cold and 0.7 s warm for zoxide, and shims lose most hooks and env vars ([shims vs PATH](https://mise.jdx.dev/dev-tools/shims.html)). It is a net loss unless every per-prompt tool is resolved to its real binary.

### Prewarm task (user alone; not recommended)

A scheduled task that runs `<tool> --version` periodically could keep the scan cache warm. It depends on an undocumented cache TTL, doesn't help mise (which scanned 1.4 s or more on every run even when warm), and produces periodic process-creation telemetry that EDR reviewers may question. It is a hack, not a fix.

### Others

- **`-NoProfileLoadTime`** only "hides the PowerShell profile load time text" ([about_Pwsh](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pwsh)). It is cosmetic.
- **Profile on OneDrive.** The profile is a small text file, and Terminal-Icons already loads on OnIdle. No measured scan cost pointed at OneDrive paths beyond `ModuleAnalysisCache` (0.4 s, once, under `%LOCALAPPDATA%`). Moving the tool binaries isn't relevant, because they are already outside OneDrive.
- **PowerShell 7.6 startup features.** None found in the docs that address native-exe spawn cost (**unverified** beyond `about_Pwsh`).

## Ranking

| # | Option | Who | Expected gain | Risk / upkeep |
|---|---|---|---|---|
| 1 | File exclusions (contextual, `OnAccess`) on the exact tool binaries, `mise.exe` first | IT | Removes most of the 5–8 s per cold binary and the 0.4–1.2 s mise cost on **every prompt** | A protection gap on user-writable files. Paths change on version upgrades, so wildcard only the version segment |
| 2 | Defer carapace completer registration and fnox activate to one-shot OnIdle | User | Moves about 14 s cold (7.7 + 6.8) and about 0.7 s warm off time-to-prompt | Input may block while OnIdle runs. Secrets load after the first idle |
| 3 | Drop atuin, or another large per-command binary | User | About 5 s cold at startup, plus per-command execs | Feature loss |
| 4 | Cache only tv and zoxide output, keyed on binary path, size and mtime, under `%LOCALAPPDATA%` | User | 0.1–0.3 s | Low, but real maintenance for little gain |
| 5 | Dev Drive with performance mode | IT | Large for repos and caches, not for tools | Policy currently disables it |
| — | Caching mise, oh-my-posh, fnox or atuin init | — | None, or negative | Stale PATH, shared session IDs, broken paths |
| — | Prewarm task | User | Partial, and none for mise | Undocumented behaviour, noisy telemetry |

## How to verify

1. Elevated: `New-MpPerformanceRecording -RecordTo $HOME\cs.etl -Seconds 60`, then open a new tab during the recording.
2. `Get-MpPerformanceReport -Path $HOME\cs.etl -TopFiles 15 -TopScansPerFile 3`. After IT adds an exclusion, the file's scans should show `SkipReason = User skipped` ([performance analyzer](https://learn.microsoft.com/en-us/defender-endpoint/tune-performance-defender-antivirus)).
3. Per-prompt cost: `Measure-Command { mise hook-env -s pwsh }` and `Measure-Command { fnox hook-env -s pwsh }`, run several times.

## Recommendation

1. Don't adopt blanket init caching. Only tv and zoxide are both safe and static, and they save well under half a second. mise and oh-my-posh are unsafe to cache, and caching fnox, atuin or carapace moves the cost rather than removing it.
2. Ask IT for contextual file exclusions (`\:{PathType:file,ScanTrigger:OnAccess}`) on the exact paths of `mise.exe`, `carapace.exe`, `fnox.exe` and `atuin.exe`, citing the performance-analyzer output above. Don't ask for process exclusions or for `pwsh.exe`.
3. Meanwhile, on your own, keep the Tab binding eager and move `carapace _carapace` and `fnox activate pwsh` into a one-shot OnIdle. Consider whether atuin is worth a 37 MiB exec per command.
4. Treat mise's per-prompt `hook-env` (0.4–1.2 s warm, 204 MiB unsigned binary) as its own problem. It affects every prompt, not only startup, and only the exclusion in step 2 fixes it without giving up live mise.
