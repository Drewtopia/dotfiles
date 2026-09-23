# GitHub auth architecture (Reference)

How git, `gh`, SSH and 1Password secrets are wired across machines. Sources: `home/.chezmoi.toml.tmpl`, `home/dot_config/git/config.tmpl`, `home/dot_ssh/`, `home/dot_config/shell/private_015-vault.sh.tmpl`.

## Machine classes

`home/.chezmoi.toml.tmpl` sets one 1Password vault per machine as `.opVault`:

| Class | How it is detected | `.opVault` |
|---|---|---|
| Personal | Known hostname (the Mac, two personal Windows hosts), or "personal" at the prompt | `Private` |
| Work | "not personal" at the prompt | `Employee` |
| Ephemeral | Codespaces, dev containers, root/ubuntu/vagrant/vscode users, no TTY, or "ephemeral" at the prompt | empty, no secrets |

Every item below exists under the same name in both vaults, with its secret in the same field, so templates read `op://<.opVault>/...` and do not branch on `.work`.

## Identity

- Global git `[user]` is the personal identity on every machine, from static data in `home/.chezmoidata/constants.toml` (`[identity]`), not from 1Password.
- `.name` and `.email` come from the vault item `Identity` (`handle`, `email`). They are only used for the work identity, which `home/dot_config/git/azure-signing.inc.tmpl` applies to Azure DevOps remotes on work WSL.

## SSH keys

- `chezmoi apply` writes keys from 1Password to `~/.ssh/` when `op` is on PATH: `SSH Key` (ed25519, `id_ed25519`) and `SSH Key - RSA` (`id_rsa`, for Azure DevOps). One key per vault; all machines of a class share it.
- The 1Password SSH agent offers `SSH Key`, `SSH Key - RSA` and `GitHub CLI` from `.opVault` (`home/.chezmoitemplates/1password-agent.toml`). On macOS `~/.ssh/config` and `SSH_AUTH_SOCK` point at the 1Password agent socket.
- `~/.ssh/config`: `IdentitiesOnly yes` with `id_ed25519`; `github.com` goes to `ssh.github.com:443` because port 22 is blocked on the corporate network; on work machines `ssh.dev.azure.com` uses `id_rsa`.
- Work WSL uses native Linux `ssh` with the keys in `~/.ssh`, not Windows `ssh.exe`.

## Tokens in the shell

`home/dot_config/shell/private_015-vault.sh.tmpl` renders to `~/.config/shell/015-vault.sh` (mode 0600) at apply time, so shell startup needs no `op` session. On non-ephemeral machines it exports:

| Variable | 1Password item | Used by |
|---|---|---|
| `GITHUB_TOKEN`, `MISE_GITHUB_TOKEN` | `GitHub PAT` / `token` | `gh`, mise, chezmoi's GitHub template functions |
| `GEMINI_API_KEY` | `Gemini API Key` / `token` | Gemini tools |
| `CONTEXT7_API_KEY` | `Context7 API Key` / `token` | context7 MCP server |

- On a first apply with no `op` on PATH the file renders empty and the next apply fills it. Once it exists, a missing `op` fails the apply instead of blanking the secrets.
- `GITHUB_TOKEN` outranks the `gh` keyring, so `gh auth login` has no effect where this file is sourced.
- macOS also renders `~/.config/homebrew/brew.env` with `HOMEBREW_GITHUB_API_TOKEN` from the same `GitHub PAT` item.

## chezmoi GitHub API calls

`gitHubLatestReleaseAssetURL` and `gitHubLatestRelease` in `home/.chezmoiexternal.toml.tmpl` (cue on Ubuntu, Maple Mono fonts on Linux and Windows, powerlevel10k) call the GitHub API. chezmoi authenticates with `GITHUB_TOKEN` from the environment; without it the limit is 60 requests an hour. `[github]` in the config sets only `refreshPeriod = "12h"`; there is no `accessToken`.

## Git credential helpers

Helpers chain in file order and git uses the first one that returns credentials. An empty `helper =` clears the helpers read before it.

| Platform | github.com, gist.github.com | dev.azure.com | Other HTTPS |
|---|---|---|---|
| macOS | `gh auth git-credential` | `manager` (Git Credential Manager) | `osxkeychain` |
| Native Windows | `gh auth git-credential` | `manager` | `manager` |
| Work WSL | `gh auth git-credential` | Windows GCM `.exe` via interop, then `~/.git-azdo-helper.sh` | Windows GCM `.exe` |
| Personal WSL, Linux | `gh auth git-credential` | none | none |

- The `gh` path is resolved at apply time with `lookPath "gh"`, falling back to the mise shim. The `gh` block must stay below every global `[credential]` helper; placed earlier, GitHub logins still reach GCM or osxkeychain, and on WSL the GCM store call hangs when interop is down.
- All Azure DevOps platforms set `useHttpPath = true` and `azreposCredentialType = oauth`. GCM needs `useHttpPath` to find the organization, including from WSL.
- On personal machines, `https://github.com/Drewtopia/` is rewritten to SSH (`url.insteadOf`), and commits are signed with `~/.ssh/id_ed25519.pub` (`gpg.format = ssh`).
- Machine-only entries go in the untracked `~/.config/git/config.local`, included last.

## Work WSL and Azure DevOps

- GCM is the primary helper and returns the cached AAD token from Windows Credential Manager.
- `~/.git-azdo-helper.sh` (`home/executable_dot_git-azdo-helper.sh`, deployed only on work WSL) is the fallback. It mints a token from the cached `az` session without a sign-in dialog, which covers headless sessions such as SSH from the Mac when the GCM token has expired. Its `--resource` GUID is the public Azure DevOps app ID, not a secret.
- Never put `helper =` before the az helper. That clears the inherited GCM helper and leaves the az helper as the only one.
- Azure DevOps repos include `~/.config/git/azure-signing.inc`, which sets the work identity and signs commits with the 1Password SSH key through `op-ssh-sign-wsl.exe` over interop. Other repos keep the personal identity and stay unsigned.
