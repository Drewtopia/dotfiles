#!/usr/bin/env bash
# Completed Azure PRs as PR-<id>\t<GH-n|ADO-nnnnn|->\t<title>; unlike merged-set.sh
# it covers pruned branches. Pages until exhausted: a lone --top truncates silently.
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
      # A prefixed GH/issue token is deliberate, so the title counts too.
      num=$(printf '%s' "$src $title" | grep -oiE '(issue-|gh-?)[0-9]{2,4}' | grep -oE '[0-9]{2,4}' | head -1 || true)
      if [ -n "$num" ]; then
        link="GH-$num"
      else
        # Bare 5-digit ADO id from the branch only: a title number may be a date or count.
        wi=$(printf '%s' "$src" | grep -oE '[0-9]{5}' | head -1 || true)
        [ -n "$wi" ] && link="ADO-$wi" || link="-"
      fi
      printf 'PR-%s\t%s\t%s\n' "$id" "$link" "$title"
    done
  [ "$n" -lt "$page" ] && break
  skip=$((skip + page))
done
