#!/usr/bin/env bash
# Git credential helper: mint an Azure DevOps access token from the cached `az`
# CLI session. Serves as the HEADLESS FALLBACK in the WSL2 Azure credential
# chain — the primary is the Windows Git Credential Manager (.exe via interop).
# git falls through to this only when GCM returns no cached token and cannot
# show its Windows sign-in dialog (e.g. a headless ssh-from-mac session with an
# expired token). Minting is non-interactive, so it works without a desktop.
#
# The --resource GUID is the public Azure DevOps first-party app ID, not a
# secret. Managed by chezmoi but deployed only on work WSL2 (gated in
# .chezmoiignore.tmpl); wired into the chain by dot_config/git/config.tmpl.
if [ "$1" = "get" ]; then
  echo "username=azuredevops"
  echo "password=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
fi
