#!/usr/bin/env bash
# Survey every background session: what each is waiting on or produced, plus the state of the
# working trees behind them. Reads state only - wakes nothing, changes nothing.
set -euo pipefail
now=$(date +%s)

declare -A tree
tree_state() {  # cwd -> "clean" | "N uncommitted, M unpushed" | "gone"
  local d=$1
  [[ -n ${tree[$d]:-} ]] && { printf '%s' "${tree[$d]}"; return; }
  local out="gone"
  if [[ -d $d ]] && git -C "$d" rev-parse --git-dir >/dev/null 2>&1; then
    local dirty unpushed
    dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l || true)
    unpushed=$(git -C "$d" log --oneline @{u}.. 2>/dev/null | wc -l || true)
    if (( dirty || unpushed )); then out="$dirty uncommitted, $unpushed unpushed"; else out="clean"; fi
  fi
  tree[$d]=$out
  printf '%s' "$out"
}

rows=$(jq -rs --argjson now "$now" '
  def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  [ .[] | select(.daemonShort and .state) ]
  | map(. + { quiet: (.lastTerminalAt // .firstTerminalAt // .updatedAt) })
  | sort_by(.quiet) | reverse | .[]
  | [ .state,
      .daemonShort,
      ((($now - (.quiet | epoch)) / 3600 | floor)
        | if . > 47 then ((. / 24 | floor | tostring) + "d") else (tostring + "h") end),
      (.name // "unnamed"),
      ((.detail // .output.result // .intent // "-") | gsub("\\s+"; " ") | .[0:150]),
      (.cwd // "-")
    ] | @tsv
' ~/.claude/jobs/*/state.json)

declare -A block count ids
order=()
while IFS=$'\t' read -r state id age name detail cwd; do
  [[ -n $state ]] || continue
  count[$state]=$(( ${count[$state]:-0} + 1 ))
  block[$state]+=$(printf '  %-9s %-4s %s\n      %s' "$id" "$age" "$name" "$detail")$'\n'
  [[ -n ${ids[$cwd]:-} ]] || order+=("$cwd")
  ids[$cwd]+="$id "
done <<< "$rows"

printf 'BLOCKED - waiting on you (%d)\n%s\n' "${count[blocked]:-0}" "${block[blocked]:-}"
printf 'DONE - review, then clear or keep (%d)\n%s\n' "${count[done]:-0}" "${block[done]:-}"
printf 'WORKING - leave alone (%d)\n%s\n' "${count[working]:-0}" "${block[working]:-}"

echo 'TREES - unsaved work lives here, not in the cards'
for cwd in "${order[@]}"; do
  printf '  %-24s %s\n      %s\n' "$(tree_state "$cwd")" "${cwd/#$HOME/\~}" "${ids[$cwd]% }"
done
