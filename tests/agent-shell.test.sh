#!/usr/bin/env bash
# Agent shells (CLAUDECODE set) survive `=word` and unmatched globs; other shells keep zsh defaults.
# Renders this checkout's dot_zshenv.tmpl into a temp HOME, so the live ~/.zshenv is never read.
# Run: bash tests/agent-shell.test.sh
set -uo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chezmoi --source "$repo" execute-template <"$repo/home/dot_zshenv.tmpl" >"$tmp/.zshenv" || exit 1

fails=0
# zsh_run <agent: 1|''> <command> → runs a fresh zsh that reads only the rendered .zshenv.
zsh_run() { env -i HOME="$tmp" PATH="$PATH" ${1:+CLAUDECODE=1} zsh -c "cd \"\$HOME\" && $2" 2>&1; }
check() { # check <name> <expected exit: 0|nonzero> <expected output substring> <agent> <command>
  local out rc
  out=$(zsh_run "$4" "$5"); rc=$?
  local exit_ok=false
  if [ "$2" = 0 ]; then [ "$rc" -eq 0 ] && exit_ok=true; else [ "$rc" -ne 0 ] && exit_ok=true; fi
  if $exit_ok && [[ "$out" == *"$3"* ]]; then
    echo "ok   - $1"
  else
    echo "FAIL - $1 (exit $rc): $out"; fails=$((fails + 1))
  fi
}

check 'agent: echo === x prints and exits 0' 0 '=== x' 1 'echo === x'
check 'agent: unmatched glob runs' 0 'ran *.nomatch' 1 'echo ran *.nomatch'
check 'default: echo === x still fails' nonzero 'not found' '' 'echo === x'
check 'default: unmatched glob still aborts' nonzero 'no matches found' '' 'echo ran *.nomatch'

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
