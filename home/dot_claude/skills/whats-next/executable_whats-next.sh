#!/usr/bin/env bash
# Survey every session: what each is waiting on or produced, plus the trees behind them.
# Reads state only - wakes nothing, changes nothing.
set -euo pipefail
now=$(date +%s)

declare -A tree
tree_state() {  # dir -> "clean" | "N uncommitted, M unpushed" | "gone"
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

roster=$(claude agents --json --all 2>/dev/null |
  jq -r '(if type=="array" then . else .agents end)[]
    | [(.kind // "-"), (.id // "-"), (.state // "-"), (.name // "unnamed"), (.cwd // "-")] | @tsv')

if [[ -z ${roster//[[:space:]]/} ]]; then
  echo "No sessions returned. The agent daemon is unreachable, so this survey is blind - start it and rerun." >&2
  exit 1
fi

declare -A block count ids
order=()
while IFS=$'\t' read -r kind id state name cwd; do
  [[ -n $kind ]] || continue
  if [[ -n ${cwd:-} && $cwd != - ]]; then
    [[ -n ${ids[$cwd]:-} ]] || order+=("$cwd")
    ids[$cwd]+="$([[ $kind == interactive ]] && echo "terminal:$name" || echo "$id") "
  fi
  [[ $kind == interactive || $id == - ]] && continue

  read -r quiet detail < <(jq -r --arg now "$now" '
    def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    [ (((($now | tonumber) - ((.lastTerminalAt // .firstTerminalAt // .updatedAt) | epoch)) / 3600) | floor),
      ((.detail // .output.result // .intent // "-") | gsub("\\s+"; " ") | .[0:150]) ] | @tsv
  ' ~/.claude/jobs/"$id"/state.json 2>/dev/null || echo -e "0\t-")
  age=$([[ ${quiet:-0} -gt 47 ]] && echo "$(( quiet / 24 ))d" || echo "${quiet:-0}h")
  count[$state]=$(( ${count[$state]:-0} + 1 ))
  block[$state]+=$(printf '%s\t%s\t%s\t%s\t%s' "${quiet:-0}" "$id" "$age" "$name" "${detail:--}")$'\n'
done <<< "$roster"

show() {  # state label -> longest-quiet first
  printf '%s (%d)\n' "$2" "${count[$1]:-0}"
  [[ -n ${block[$1]:-} ]] || { echo; return; }
  printf '%s' "${block[$1]}" | sort -t$'\t' -k1,1nr |
    awk -F'\t' '{ printf "  %-9s %-4s %s\n      %s\n", $2, $3, $4, $5 }'
  echo
}

show blocked 'BLOCKED - waiting on you'
show done    'DONE - review, then clear or keep'
show working 'WORKING - leave alone'

echo 'TREES - unsaved work lives here, not in the cards'
for cwd in "${order[@]}"; do
  printf '  %-26s %s\n      %s\n' "$(tree_state "$cwd")" "${cwd/#$HOME/\~}" "${ids[$cwd]% }"
done
