---
"drewtopia-dotfiles": patch
---

Track the 1Password beta channel instead of nightly on macOS.

- `home/.chezmoiscripts/darwin/run_onchange_before_10-install-brew-packages.sh.tmpl` now lists the `1password@beta` cask in place of `1password@nightly`.
- Both casks install the same artifact to `/Applications/1Password.app`, so a machine that still has the nightly cask will hit an app collision when `brew bundle` runs. The script uses `set -eufo pipefail`, so that collision aborts the rest of it — the Mac App Store installs and the Quick Look quarantine strip never run. Uninstall the nightly cask first on any such machine: `brew uninstall --cask 1password@nightly`.
- Both channels ship under Team ID `2BUA8C4S2C`, so the SSH agent socket path in `dot_zshenv.tmpl` and `dot_ssh/config.tmpl` is unaffected.
