#!/bin/sh

set -e # -e: exit on error

# Note: chezmoi.toml.tmpl now uses a hybrid `if lookPath "op"` block —
# if op is installed, identity is read from 1Password; if not, init
# prompts for name + email and stores them in the local chezmoi.toml.
# Either way, init succeeds without manual prereqs. After first apply,
# run_onchange_before_20-install-1password installs op for downstream
# apply-time templates that need it (zshrc, ssh keys, etc.).

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

# When run from a local clone (./install.sh) use that source dir;
# when piped in (curl ... | sh) fall back to the GitHub user `drewtopia`,
# which chezmoi resolves to github.com/drewtopia/dotfiles.
script_path="$(command -v -- "$0" 2>/dev/null || true)"
if [ -n "$script_path" ] && [ -f "$script_path" ]; then
  script_dir="$(cd -P -- "$(dirname -- "$script_path")" && pwd -P)"
  exec "$chezmoi" init --apply "--source=$script_dir"
else
  exec "$chezmoi" init --apply drewtopia
fi