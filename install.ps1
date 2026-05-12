#!/usr/bin/env pwsh
# Windows sibling of install.sh.
#
# Note: chezmoi.toml.tmpl uses a hybrid `if lookPath "op"` block — if op
# is already installed (via scoop in run_onchange_before_10-install-scoop),
# identity is read from 1Password; if not, init prompts for name + email
# and stores them locally. Either way, no manual prereqs needed beyond
# chezmoi itself, which this script installs.

$ErrorActionPreference = "Stop"

if (-not (Get-Command chezmoi -ErrorAction SilentlyContinue)) {
    $binDir = Join-Path $env:LocalAppData "Programs\chezmoi\bin"
    Write-Host "Installing chezmoi to $binDir..."
    & ([scriptblock]::Create((Invoke-RestMethod -UseBasicParsing https://get.chezmoi.io/ps1))) -b $binDir
    $env:PATH = "$binDir;$env:PATH"
    $chezmoi = Join-Path $binDir "chezmoi.exe"
} else {
    $chezmoi = "chezmoi"
}

# Mirror install.sh: when run from a local clone (.\install.ps1) use that
# source dir; when piped in (irm ... | iex) fall back to the GitHub user
# `drewtopia`, which chezmoi resolves to github.com/drewtopia/dotfiles.
if ($PSScriptRoot) {
    & $chezmoi init --apply "--source=$PSScriptRoot"
} else {
    & $chezmoi init --apply drewtopia
}
