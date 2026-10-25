#!/usr/bin/env pwsh
# Pester runner. Relocated machines block the profile copy of Pester.dll, which
# PSModulePath finds first, so import Pester from PESTER_MODULE_ROOT when set.
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
