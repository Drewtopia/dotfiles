#!/usr/bin/env pwsh
# Pester test runner.
#
# On work-Windows (relocated) machines, endpoint security blocks loading
# Pester.dll from the default user-profile module dir
# (Documents\PowerShell\Modules), surfacing as "Should operator 'Be' is not
# registered". A whitelisted copy lives under the relocation tools_root, and
# the relocation env-var script exports its path as PESTER_MODULE_ROOT. Import
# Pester by explicit path from there, because PSModulePath search resolves the
# blocked profile copy first regardless of ordering.
#
# On personal machines PESTER_MODULE_ROOT is unset and Pester loads normally
# from PSModulePath.
#
# Run:  pwsh -NoProfile -File ./tests/Invoke.ps1
[CmdletBinding()]
param(
    [string]$Path = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$root = $env:PESTER_MODULE_ROOT
if ($root -and (Test-Path (Join-Path $root 'Pester'))) {
    Import-Module (Join-Path $root 'Pester') -ErrorAction Stop
} else {
    Import-Module Pester -ErrorAction Stop
}

Invoke-Pester -Path $Path -Output Detailed
