#!/usr/bin/env bash
# Find sessions working the same ground: one directory held by several, or one file edited by two.
# Reads state and transcripts only - wakes nothing, changes nothing.
set -euo pipefail
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

claude agents --json --all 2>/dev/null |
  jq -r '(if type=="array" then . else .agents end)[]
    | [(.kind // "-"), (.id // "-"), (.state // "-"), (.name // "unnamed"), (.cwd // "-")] | @tsv' \
  > "$tmp/live.tsv"

if [[ ! -s $tmp/live.tsv ]]; then
  echo "No sessions returned. The agent daemon is unreachable, so this survey is blind - start it and rerun." >&2
  exit 1
fi

echo 'SHARED GROUND - these sessions edit the same files'
cut -f5 "$tmp/live.tsv" | sort | uniq -c | awk '$1 > 1 { $1=""; sub(/^ +/,""); print }' |
while IFS= read -r dir; do
  dirty=0; branch='-'
  if [[ -d $dir ]] && git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
    dirty=$(git -C "$dir" status --porcelain 2>/dev/null | wc -l || true)
    branch=$(git -C "$dir" branch --show-current 2>/dev/null || echo '-')
  fi
  printf '\n  %s  [%s]  %s uncommitted\n' "${dir/#$HOME/\~}" "$branch" "$dirty"
  awk -F'\t' -v d="$dir" '$5==d { printf "      %-8s %-11s %-8s %s\n", $2, $1, $3, $4 }' "$tmp/live.tsv"
done

echo
while IFS=$'\t' read -r kind id state name cwd; do
  [[ $id == - ]] && continue
  p=$(jq -r '.linkScanPath // empty' ~/.claude/jobs/"$id"/state.json 2>/dev/null || true)
  [[ -f ${p:-} ]] || continue
  b=$(tail -c 500000 "$p" | grep -o '"gitBranch":"[^"]*"' | tail -1 | cut -d'"' -f4 || true)
  [[ -n ${b:-} ]] && printf '%s\t%s\n' "$b" "$id"
done < "$tmp/live.tsv" > "$tmp/branches.tsv" || true

echo
echo 'SAME BRANCH - what each session was last working on, wherever it sits now'
cut -f1 "$tmp/branches.tsv" | sort | uniq -c | awk '$1 > 1 { $1=""; sub(/^ +/,""); print }' |
while IFS= read -r b; do
  printf '\n  %s\n' "$b"
  awk -F'\t' -v b="$b" '$1==b { print $2 }' "$tmp/branches.tsv" | while read -r i; do
    awk -F'\t' -v i="$i" '$2==i { printf "      %-8s %-8s %s\n", $2, $3, $4 }' "$tmp/live.tsv"
  done
done

echo
echo 'NAME CLASHES - one name, unrelated work'
cut -f4 "$tmp/live.tsv" | sort | uniq -c | awk '$1 > 1 { $1=""; sub(/^ +/,""); print }' |
while IFS= read -r nm; do
  dirs=$(awk -F'\t' -v n="$nm" '$4==n { print $5 }' "$tmp/live.tsv" | sort -u | wc -l)
  (( dirs > 1 )) || continue
  printf '\n  "%s" covers %s directories\n' "$nm" "$dirs"
  awk -F'\t' -v n="$nm" '$4==n { printf "      %-8s %-11s %s\n", $2, $1, $5 }' "$tmp/live.tsv" |
    sed "s|$HOME|~|"
done

while IFS=$'\t' read -r kind id state name cwd; do
  [[ $id == - ]] && continue
  p=$(jq -r '.linkScanPath // empty' ~/.claude/jobs/"$id"/state.json 2>/dev/null || true)
  [[ -f ${p:-} ]] || continue
  grep -o '"file_path":"[^"]*"' "$p" 2>/dev/null | sed 's/.*"file_path":"//;s/"$//' |
    sort -u | sed "s|^|$id\t|" || true
done < "$tmp/live.tsv" > "$tmp/touched.tsv"

echo
echo 'SAME FILE, TWO SESSIONS - reconcile before either commits'
cut -f2 "$tmp/touched.tsv" | sort | uniq -c | awk '$1 > 1 { $1=""; sub(/^ +/,""); print }' |
while IFS= read -r f; do
  printf '\n  %s\n' "${f/#$HOME/\~}"
  awk -F'\t' -v f="$f" '$2==f { print $1 }' "$tmp/touched.tsv" | while read -r i; do
    awk -F'\t' -v i="$i" '$2==i { printf "      %-8s %-8s %s\n", $2, $3, $4 }' "$tmp/live.tsv"
  done
done

echo
echo 'Interactive sessions keep no transcript card, so they appear above only by directory.'
echo 'Edits made through shell commands carry no file path: this is a floor, not a ceiling.'
