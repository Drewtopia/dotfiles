#!/usr/bin/env bash
# Server-side "done" set from Azure PR history — sibling of merged-set.sh.
# merged-set.sh reads LOCAL branches, so it misses anything already pruned;
# this reads the PR list on the host and spans pruned branches too.
# Output: <ref>\t<linked-id>\t<title>  — col 3 (title) is extra over merged-set.sh.
#   ref = PR-<id>,  linked-id = GH-<n> | ADO-<5digit> | -
#   GH-<n> from an explicit gh/issue token in branch OR title; ADO-<5digit> from
#   a bare 5-digit run in the BRANCH only (a title number is not a reliable id).
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
      # Explicit GH/issue token: read from branch AND title. The prefix makes it
      # deliberate, so a title reference is a real link, not noise — this repo's
      # convention puts the id in the title while the branch stays conventional-commit.
      num=$(printf '%s' "$src $title" | grep -oiE '(issue-|gh-?)[0-9]{2,4}' | grep -oE '[0-9]{2,4}' | head -1 || true)
      if [ -n "$num" ]; then
        link="GH-$num"
      else
        # Bare 5-digit ADO id: branch ONLY, never the title. An unprefixed number
        # in a title (a date, a count) would mint a phantom work-item link; the
        # branch is the only field where a lone 5-digit run is reliably an id.
        wi=$(printf '%s' "$src" | grep -oE '[0-9]{5}' | head -1 || true)
        [ -n "$wi" ] && link="ADO-$wi" || link="-"
      fi
      printf 'PR-%s\t%s\t%s\n' "$id" "$link" "$title"
    done
  [ "$n" -lt "$page" ] && break
  skip=$((skip + page))
done
