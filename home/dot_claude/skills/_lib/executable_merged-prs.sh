#!/usr/bin/env bash
# Server-side "done" set from Azure PR history — sibling of merged-set.sh.
# merged-set.sh reads LOCAL branches, so it misses anything already pruned;
# this reads the PR list on the host and spans pruned branches too.
# Output: <ref>\t<linked-id>\t<title>  — cols 1-2 match merged-set.sh, col 3 is extra.
#   ref = PR-<id>,  linked-id = GH-<n> | ADO-<5digit> | -
# Pages until exhausted: a lone --top truncates silently and turns a missed
# ghost into a clean-looking zero.
set -uo pipefail
page=200
skip=0
while :; do
  batch=$(az repos pr list --status completed --top "$page" --skip "$skip" \
            --query "[].{id:pullRequestId,src:sourceRefName,title:title}" -o json 2>/dev/null) || break
  n=$(printf '%s' "$batch" | jq 'length' 2>/dev/null || echo 0)
  [ "$n" -eq 0 ] && break
  printf '%s' "$batch" | jq -r '.[] | [.id, (.src // ""), .title] | @tsv' |
    while IFS=$'\t' read -r id src title; do
      hay="$src $title"
      num=$(printf '%s' "$hay" | grep -oiE '(issue-|gh-?)[0-9]{2,4}' | grep -oE '[0-9]{2,4}' | head -1 || true)
      if [ -n "$num" ]; then
        link="GH-$num"
      else
        wi=$(printf '%s' "$hay" | grep -oE '[0-9]{5}' | head -1 || true)
        [ -n "$wi" ] && link="ADO-$wi" || link="-"
      fi
      printf 'PR-%s\t%s\t%s\n' "$id" "$link" "$title"
    done
  [ "$n" -lt "$page" ] && break
  skip=$((skip + page))
done
