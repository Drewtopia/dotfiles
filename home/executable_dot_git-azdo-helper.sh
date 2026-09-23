#!/usr/bin/env bash
# Headless fallback in the WSL2 Azure credential chain: git reaches it only when
# the Windows GCM has no cached token and cannot show its sign-in dialog.
# The --resource GUID is Azure DevOps' public first-party app ID, not a secret.
if [ "$1" = "get" ]; then
  echo "username=azuredevops"
  echo "password=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
fi
