#!/bin/sh

set -e # -e: exit on error

# Prerequisite: 1Password CLI must be installed AND signed in.
# `chezmoi.toml.tmpl` calls onepasswordRead at init time to fetch
# identity from the vault, so missing/locked op = init failure.
# Skip this check on first-time ephemeral installs (no opVault yet).
if ! command -v op >/dev/null 2>&1; then
  echo "Missing prerequisite: 1Password CLI (op)" >&2
  case "$(uname -s)" in
    Darwin) echo "  Install: brew install 1password-cli" >&2 ;;
    Linux)  echo "  Install: https://developer.1password.com/docs/cli/get-started/" >&2 ;;
    MINGW*|MSYS*|CYGWIN*) echo "  Install: scoop install 1password-cli" >&2 ;;
    *)      echo "  Install: see https://developer.1password.com/docs/cli/" >&2 ;;
  esac
  echo "Then sign in: eval \$(op signin)  (or use the desktop app integration)" >&2
  exit 1
fi
if ! op whoami >/dev/null 2>&1; then
  echo "1Password CLI is installed but not signed in." >&2
  echo "  Sign in: eval \$(op signin)" >&2
  echo "  (or enable the desktop app integration in 1Password settings)" >&2
  exit 1
fi

if [ ! "$(command -v chezmoi)" ]; then
  bin_dir="$HOME/.local/bin"
  chezmoi="$bin_dir/chezmoi"
  if [ "$(command -v curl)" ]; then
    sh -c "$(curl -fsSL https://git.io/chezmoi)" -- -b "$bin_dir"
  elif [ "$(command -v wget)" ]; then
    sh -c "$(wget -qO- https://git.io/chezmoi)" -- -b "$bin_dir"
  else
    echo "To install chezmoi, you must have curl or wget installed." >&2
    exit 1
  fi
else
  chezmoi=chezmoi
fi

# POSIX way to get script's dir: https://stackoverflow.com/a/29834779/12156188
script_dir="$(cd -P -- "$(dirname -- "$(command -v -- "$0")")" && pwd -P)"
# exec: replace current process with chezmoi init
exec "$chezmoi" init --apply "--source=$script_dir"