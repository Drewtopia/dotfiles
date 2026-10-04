#!/usr/bin/env pwsh
# Windows sibling of install.sh.
#
# Note: chezmoi.toml.tmpl uses a hybrid `if lookPath "op"` block — if op
# is already on PATH, identity is read from 1Password; if not, init prompts
# for name + email and stores them locally. The first apply installs op via
# winget (.chezmoidata/winget.toml), so later inits can use it. Either way,
# no manual prereqs needed beyond chezmoi itself, which this script installs.

$ErrorActionPreference = "Stop"

# winget puts chezmoi on PATH for new shells and upgrades it later. The
# get.chezmoi.io script is the fallback for boxes without winget; it only
# drops the binary, so its dir is added to User PATH here.
if (-not (Get-Command chezmoi -ErrorAction SilentlyContinue) -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Installing chezmoi via winget..."
    winget install --id twpayne.chezmoi --exact --source winget `
        --disable-interactivity `
        --accept-source-agreements `
        --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

if (-not (Get-Command chezmoi -ErrorAction SilentlyContinue)) {
    $binDir = Join-Path $env:LocalAppData "Programs\chezmoi\bin"
    Write-Host "Installing chezmoi to $binDir..."
    & ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing https://get.chezmoi.io/ps1))) -b $binDir
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($userPath -split ';') -notcontains $binDir) {
        [Environment]::SetEnvironmentVariable('Path', "$binDir;$userPath", 'User')
    }
    $env:Path = "$binDir;$env:Path"
}

$chezmoi = (Get-Command chezmoi).Source

# Mirror install.sh: when run from a local clone (.\install.ps1) use that
# source dir; when piped in (irm ... | iex) fall back to the GitHub user
# `drewtopia`, which chezmoi resolves to github.com/drewtopia/dotfiles.
if ($PSScriptRoot) {
    & $chezmoi init --apply "--source=$PSScriptRoot"
} else {
    & $chezmoi init --apply drewtopia
}
