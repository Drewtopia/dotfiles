# ADR-0002: chezmoi runs Windows scripts with built-in PowerShell 5.1

Status: accepted, 2026-03-19

## Context

A fresh Windows machine ships only Windows PowerShell 5.1 (`powershell.exe`). PowerShell 7 (`pwsh`) is what the rest of the setup targets, but it is not there until something installs it. If chezmoi's `.ps1` interpreter were `pwsh`, no script could run on first apply, including the one that installs `pwsh`.

## Decision

- `home/.chezmoi.toml.tmpl` sets `[interpreters.ps1] command = "powershell.exe"` with `-NoLogo -NoProfile -NonInteractive`. `-NonInteractive` stops a Ctrl-C'd script from leaking its `PS>` prompt into the parent terminal.
- `[cd] command = "pwsh"` is only for interactive `chezmoi cd`.
- The first Windows script, `home/.chezmoiscripts/windows/run_onchange_before_00-install-powershell.ps1.tmpl`, installs PowerShell 7 with winget. Later scripts in the same apply can use it.
- Scripts that need PowerShell 7 re-launch themselves under `pwsh` when `$PSVersionTable.PSVersion.Major -lt 7`, and fall back to 5.1 with a warning if `pwsh` is missing. Examples: `common/run_onchange_after_10-install-mise-tools.ps1.tmpl`, `common/run_onchange_after_40-install-claude-code.ps1.tmpl`, `windows/run_onchange_after_60-install-pwsh-modules.ps1.tmpl`.

## Consequences

- One `chezmoi apply` bootstraps a stock Windows machine without any manual step.
- Every `.ps1` script must parse and start under PowerShell 5.1. It cannot use 7-only syntax such as `??`, ternaries or `&&` chains, even if it later re-launches itself under `pwsh`.
- 5.1 differs in ways that bite: `PSModulePath` and module auto-loading (see the `PSEdition -eq 'Desktop'` fix in `windows/run_onchange_before_10-install-scoop.ps1.tmpl`), and default file encodings.
- Re-launching costs one extra process spawn per script, and the re-launch pattern is copied into each script instead of being enforced in one place.
