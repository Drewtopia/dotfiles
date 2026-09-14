# WSL2 + Windows: git, SSH and 1Password (Design doc)

> **Date:** 2026-09-14
> **Purpose:** Compare the current git/SSH/1Password wiring on the WSL2 work machine against the documented alternatives, and recommend one approach per job.
> **Companion:** See `github-auth-architecture.md` for the credential-helper chain and the 1Password reference map.

## Summary

Every Windows program called from WSL (Windows Subsystem for Linux) goes through one bridge, called "interop". When that bridge stops accepting connections, every job that depends on it fails together: pushing, signing commits, and fetching HTTPS credentials. Microsoft has no documented fix or setting for this. Recommendation: run the jobs that happen on every commit or push inside Linux, with no interop. That means HTTPS through the `gh` credential helper for GitHub repositories you own, native Linux `ssh` for repositories owned by other accounts (which a fine-grained token cannot reach), and native `ssh-keygen` for signing with the key chezmoi already writes to disk. Keep interop only where a failure is rare and easy to retry: HTTPS credentials (with the Linux-side token helper moved first) and `chezmoi apply`. The cost is that the SSH keys sit on the WSL disk, so 1Password's per-app approval prompt no longer guards them.

## Current setup

| Job | Mechanism | Depends on interop |
|-----|-----------|--------------------|
| git transport (SSH) | `core.sshCommand` = Windows `ssh.exe` talking to the 1Password agent. An open change switches this to Linux `ssh` with the chezmoi-rendered `~/.ssh/id_ed25519` (GitHub via `ssh.github.com:443`) and `~/.ssh/id_rsa` (Azure DevOps) | Yes (No once the change lands) |
| Commit signing (Azure DevOps repos) | `gpg.format=ssh`, `gpg.ssh.program` = 1Password `op-ssh-sign-wsl.exe`, scoped with `includeIf hasconfig:remote.*.url` | Yes |
| HTTPS credentials (Azure DevOps) | Windows Git Credential Manager (`git-credential-manager.exe`) first, az-CLI token helper second | Yes for the first helper |
| chezmoi secret reads | `onepasswordRead` runs `op read`; some templates also call `cmd.exe` | Yes (desktop-app path and `cmd.exe`) |

## The shared failure: WSL interop over vsock

A "vsock" is the virtual socket that connects the WSL2 virtual machine to the Windows host. Launching a Windows program from Linux opens one.

- The `[interop]` settings are only on/off switches. `enabled` controls "whether WSL will support launching Windows processes"; `appendWindowsPath` controls PATH only. There is no setting for timeouts or connection limits [1].
- microsoft/WSL#40650 (open, WSL 2.7.3.0, opened 2026-05-27) measures about 9 vsock connections per WSL session. At ~167 connections new sessions fail with `accept4 failed 110`: "Error 110 = ETIMEDOUT. No new WSL sessions can be established." The title says "no tunable limit exists". No maintainer response or fix is visible [2].
- microsoft/WSL#13864 and #13740 (both closed, WSL 2.6.1.0) report the same error making `git push` hang or fail. The reporters suspect credential-helper or SSH interop. The only workaround given is restarting VS Code, and "the problem eventually returns" [3][4].
- microsoft/WSL#8677 (open since 2022) reports the same error when running a Windows program from an SSH session into WSL. The interop handshake polls for 10 seconds and then gives up [5].
- No WSL release note naming a fix was found (UNVERIFIED that none exists). `wsl --shutdown` is documented only as a way to restart every distribution [1]. Whether it clears this state is UNVERIFIED.

The error is a timeout, and #13864 describes an indefinite hang [3]. So a job that goes through interop may stall instead of failing fast.

## Options per job

### 1. git transport

**A. Windows `ssh.exe` via interop (1Password's documented WSL method)**
- How: "you can effectively forward the entire SSH request from WSL to the `ssh.exe` process running on Windows", which then uses the 1Password agent; config is `git config --global core.sshCommand ssh.exe` [6].
- Interop: one Windows process per git network operation.
- Security: "your private key never even leaves the 1Password app" [7]. Once approved, a key is usable by that application "without being prompted again until 1Password locks or quits" [8].
- Failure modes: every fetch and push fails or hangs while interop is down [2][3]. 1Password states "SSH configuration changes must be made in your Windows `%USERPROFILE%/.ssh/config` file, not the WSL instance's file" [6], so the port-443 GitHub override in WSL's `~/.ssh/config` does not apply and must be repeated on the Windows side.
- Maintenance: the signer's path changed with the MSIX installer (1Password 8.11.18+) [6]. Hard-coded Windows paths can break on app updates.

**B. Linux `ssh` with keys on the WSL disk (current)**
- How: git runs `ssh` unless `core.sshCommand` or `GIT_SSH_COMMAND` is set. The environment variable overrides the config key [9].
- Interop: none per operation. chezmoi needs 1Password only at apply time to write the key files.
- Security: Microsoft's Azure DevOps docs say "Private key files are the equivalent of a password and should be protected the same way", and that a passphrase "adds another layer of protection for your private key if the file is exposed" [10]. The WSL home directory is also reachable from Windows at `\\wsl$\<distro>\home\<user>` [11], so any Windows process running as the user can read the files. No approval prompt applies.
- Failure modes: none from interop. A key rotated in 1Password stays stale on disk until the next `chezmoi apply`.
- Azure DevOps specifics: only RSA keys are supported, and "Azure DevOps accepts the first key provided by the client during authentication", so the host entry needs `IdentityFile` + `IdentitiesOnly yes` [10].
- GitHub: `Host github.com` → `Hostname ssh.github.com`, `Port 443` [12].

**C. Linux `ssh` + relay of the Windows agent pipe into a Linux socket**
1Password's Windows agent listens on `\\.\pipe\openssh-ssh-agent`, after the Windows "OpenSSH Authentication Agent" service is disabled [8]. A relay puts that pipe behind a Unix socket and sets `SSH_AUTH_SOCK`, so Linux `ssh` talks to the 1Password agent. 1Password's WSL page does not mention this method [6].
- *npiperelay + socat.* npiperelay "allows you to access a Windows named pipe in a way that is more compatible with a variety of command-line tools" [13]. Its example runs `socat UNIX-LISTEN:...,fork ... EXEC:"npiperelay.exe -ep -s //./pipe/docker_engine",nofork` [14]. socat's `fork` "handles its channel in a child process" for each connection, and `EXEC` "Forks a sub process ... and invokes the specified program" [15]. So **each agent connection starts `npiperelay.exe` through interop**, which means the same exposure as option A. npiperelay has 11 commits and no visible releases [13]. Its README gives no ssh-agent example (UNVERIFIED for 1Password).
- *wsl2-ssh-agent.* It "starts a server that listen on a UNIX domain socket in WSL2" and "invokes a PowerShell.exe child process on the Windows host", talking over stdin/stdout through interop to the agent pipe [16]. That is one long-lived Windows process, not one per connection. Whether it survives or reconnects after an interop outage is UNVERIFIED; the README does not say [16]. The README does not mention 1Password compatibility (UNVERIFIED).
- Security: same as A. The keys stay in the vault and approval prompts apply [7][8].
- Maintenance: a third-party binary or script, plus a shell hook to start it.

**D. HTTPS with the `gh` credential helper (GitHub only)**
- How: remotes use `https://github.com/...`; git asks `gh auth git-credential`, which answers from `GITHUB_TOKEN` when that variable is set (here a fine-grained token read from 1Password into a shell file). Git tries helpers in order and stores a successful credential in every helper, so the host-scoped section starts with an empty `helper =` to reset the inherited Windows GCM [25]. The reset clears only helpers read before it, so the section must come after the global `credential.helper` line in the file (or in a later-read config such as a repository's own `.git/config`).
- Interop: none, once GCM is reset out of the `github.com` chain. Without an effective reset, each successful login still calls `git-credential-manager.exe store` through interop, which hangs while interop is down.
- Security: a token on disk instead of a key, but a fine-grained token is limited to the repositories and permissions chosen for it.
- Limits: a fine-grained token "will only be able to access resources owned by the selected resource owner", and GitHub lists contributing "to repositories where the user is an outside or repository collaborator" among what fine-grained tokens cannot do [30]. Repositories owned by another account therefore need SSH (option B) or a classic token.

### 2. Commit signing

**A. `op-ssh-sign-wsl.exe` via interop (current)**
- How: 1Password sets `gpg.format` to `ssh` and `gpg.ssh.program` to "the SSH signer binary provided by 1Password, so you don't have to set `SSH_AUTH_SOCK` yourself" [17]. The WSL flow needs Git 2.34+ and 64-bit Windows 10+ with no ARM support [6].
- Interop: one Windows process per signed commit or tag.
- Security: each use prompts "a 1Password prompt asking to authorize the use of a commit signing key" [17]. The key stays in the vault [7].
- Failure modes: with signing required, **committing itself** fails while interop is down, not just pushing. The binary path moved in 8.11.18 [6].

**B. `ssh-keygen` with the on-disk key**
- How: `gpg.format` accepts `ssh`, and "The default value for `gpg.ssh.program` is "ssh-keygen"" [18]. Set `user.signingkey` to the key path [19].
- Interop: none.
- Security: same as transport option B. A copy of the key file can sign as the user.
- Verification: GitHub checks signatures "against a public key you have added to your account" [20]. Using one key for both jobs means uploading it twice: "If you want to use the same SSH key for both authentication and signing, you need to upload it twice" [21]. Local `git log --show-signature` needs `gpg.ssh.allowedSignersFile`, which lists "principals followed by an ssh public key" [18][17].

**C. `ssh-keygen` with the key held by a relayed agent**
- How: `ssh-keygen -Y sign` takes `-f`, which "may refer to either a private key, or a public key with the private half available via ssh-agent(1)" [22]. So set `user.signingkey` to the `.pub` file and let the transport-option-C relay supply the private half.
- Interop and security: same as transport option C.

**Scoping.** `includeIf "hasconfig:remote.*.url:<pattern>"` applies when any remote URL matches, and "Files included by this option (directly or indirectly) are not allowed to contain remote URLs" [9]. All three options fit inside the existing include unchanged.

### 3. HTTPS credentials (Azure DevOps)

**A. Windows GCM via interop (current first helper)**
- How: `credential.helper` set to `/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe`, plus `credential.https://dev.azure.com.useHttpPath true` for Azure DevOps [23]. Tokens are kept in Windows Credential Manager and shared with Windows apps [11][23].
- Interop: one Windows process per credential lookup.
- Failure modes: interop outage. Also, "configuration set in WSL Git is NOT respected by GCM (by default)", so proxy settings must be set on both sides [11].

**B. Linux GCM**
- How: install GCM inside the distribution. This "means GCM is running as a Linux application and cannot utilize the authentication or credential storage features of the host Windows operating system" [11].
- Stores: `secretservice` "Requires a graphical user interface session"; `gpg`/`pass` works headless with a terminal pin-entry program; `cache` works headless; `plaintext` "lacks security protections" [24].
- Interop: none. Maintenance: a second GCM install plus a store to configure.

**C. az-CLI token helper (current second helper)**
- How: a script mints a token from the cached `az` session (see `github-auth-architecture.md`). Interop: none, assuming a Linux `az` install (UNVERIFIED on the target machine).
- Chain behaviour: "each helper will be tried in turn ... Once Git has acquired both a username and a non-expired password, no more helpers will be tried", and an empty `helper =` resets the list [25]. Helpers run in order, so a hanging first helper (see the timeout above) holds up the whole chain before the second helper ever runs.

**D. SSH remotes instead of HTTPS.** Azure DevOps SSH is documented with examples on port 22 only [10], and the corporate network blocks outbound 22. Whether Azure DevOps accepts SSH on 443 is UNVERIFIED. The docs also say LFS does not work over SSH ("Use HTTPS to connect to repos with Git LFS tracked files") [10].

### 4. chezmoi secret reads

- chezmoi runs `op read $URL` for `onepasswordRead`. It supports `account` (default), `connect` and `service` modes [26].
- **A. Desktop-app integration (current).** 1Password documents app integration for Mac, Windows and Linux. On Linux it requires "1Password for Linux" and a running PolKit authentication agent [27]. It does not mention WSL [27]. How a Linux `op` in WSL reaches the Windows app is therefore UNVERIFIED against vendor docs; the observed outage behaviour suggests interop.
- **B. Manual sign-in.** `eval "$(op signin)"` needs no desktop app. "Sessions expire after 30 minutes of inactivity" [28]. The same page says app integration mitigates risks that manual sign-in carries [28]. Interop: none.
- **C. Service account.** Token-based, CLI 2.18.0+ [29]. A service account cannot be granted "your built-in Personal, Private, or Employee vault, or your default Shared vault" [29], and chezmoi notes it "prevent[s] the CLI from working with multiple accounts" [26]. The SSH key items live in a built-in vault, so this option works only after moving them to a custom vault.

## Recommendation per job

| Job | Recommendation | Trade-off accepted |
|-----|----------------|--------------------|
| git transport | **D for repositories you own (HTTPS via `gh`); B for collaborator repositories (Linux `ssh`, keys on disk)** | Token and keys readable by anything running as the user, from WSL or through `\\wsl$`; no approval prompt |
| Commit signing | **B: `ssh-keygen` with the on-disk key** | Loses 1Password's approval prompt for signing; must upload the key as a signing key where verification matters |
| HTTPS credentials | **Keep A + C, but move the az-CLI helper before GCM for `dev.azure.com`** | When the az session has expired, auth falls through to GCM, which needs interop and a Windows sign-in dialog |
| chezmoi reads | **Keep A; use B (`op signin`) when interop is down** | `chezmoi apply` is occasional and retryable, so an outage costs a retry, not a blocked commit |

Why: signing runs on every commit and transport on every push, so those two need to work when interop does not. Option C keeps the keys in the vault but still depends on interop, either per connection (npiperelay) or through one long-lived process (wsl2-ssh-agent). Transport option B plus signing option B is the only combination that removes interop from the commit/push path. Signing with the same on-disk key adds no new exposure, because transport already put that key on disk.

**What would change the recommendation:**
- A WSL release that fixes or makes tunable the vsock limit in microsoft/WSL#40650 [2] → option A for transport and signing becomes viable again.
- A policy requiring that private keys never touch disk → transport C with wsl2-ssh-agent, signing C, and accept the interop dependency. Test first whether wsl2-ssh-agent recovers after an outage.
- Evidence that Azure DevOps verifies SSH commit signatures, or requires signing (UNVERIFIED either way) → weigh the approval prompt more heavily.
- Removing the keys from disk while keeping transport B → keep keys only in a relayed agent (option C); otherwise the risk of keys on disk stays.

## Open questions / UNVERIFIED

1. No WSL release note or maintainer statement confirms a fix for `UtilAcceptVsock ... accept4 failed 110`. #40650 is open with no visible response [2].
2. Whether `wsl --shutdown` reliably clears the condition. Documented only as a restart [1].
3. How the Linux `op` CLI inside WSL reaches the Windows desktop app. 1Password's app-integration page does not mention WSL [27].
4. Whether wsl2-ssh-agent reconnects after its PowerShell process dies, and whether it works with 1Password's agent pipe [16].
5. Whether npiperelay has been tested with 1Password's `openssh-ssh-agent` pipe [13].
6. Whether Azure DevOps accepts SSH on port 443 [10].
7. Whether Azure DevOps verifies or displays SSH commit signatures.
8. Whether the chezmoi-rendered private keys are passphrase-protected. Passphrase protection would change the on-disk risk [10].
9. Whether `az` on the work machine is a Linux install, which is what keeps the az-CLI helper free of interop.

## Sources

1. https://learn.microsoft.com/en-us/windows/wsl/wsl-config
2. https://github.com/microsoft/wsl/issues/40650
3. https://github.com/microsoft/wsl/issues/13864
4. https://github.com/microsoft/wsl/issues/13740
5. https://github.com/microsoft/WSL/issues/8677
6. https://www.1password.dev/ssh/integrations/wsl/
7. https://www.1password.dev/ssh/agent/
8. https://www.1password.dev/ssh/get-started/
9. https://git-scm.com/docs/git-config (and https://raw.githubusercontent.com/git/git/master/Documentation/config/core.adoc for `core.sshCommand`)
10. https://learn.microsoft.com/en-us/azure/devops/repos/git/use-ssh-keys-to-authenticate
11. https://learn.microsoft.com/en-us/windows/wsl/tutorials/wsl-git
12. https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port
13. https://github.com/jstarks/npiperelay
14. https://raw.githubusercontent.com/jstarks/npiperelay/master/scripts/docker-relay
15. http://www.dest-unreach.org/socat/doc/socat.html
16. https://github.com/mame/wsl2-ssh-agent
17. https://www.1password.dev/ssh/git-commit-signing/
18. https://raw.githubusercontent.com/git/git/master/Documentation/config/gpg.adoc
19. https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key
20. https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification
21. https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account
22. https://man.openbsd.org/ssh-keygen
23. https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/wsl.md
24. https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/credstores.md
25. https://git-scm.com/docs/gitcredentials
26. https://www.chezmoi.io/user-guide/password-managers/1password/
27. https://www.1password.dev/cli/app-integration/
28. https://www.1password.dev/cli/sign-in-manually/
29. https://www.1password.dev/service-accounts/get-started/
30. https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
