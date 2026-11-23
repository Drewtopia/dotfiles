#!/usr/bin/env bash
# Every template under home/ renders with no chezmoi config and the data in fixtures/ci-data.json,
# once as a Mac or Linux machine and once as WSL. Templates that read 1Password are skipped: CI
# has no vault, and the config template (home/.chezmoi.toml.tmpl) is one of them.
# Run: bash tests/render-templates.test.sh
set -uo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/render.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
: >"$tmp/empty.toml"

fails=0 rendered=0 skipped=0
for wsl in false true; do
  data=$(jq -c --argjson wsl "$wsl" '.is_wsl = $wsl' "$repo/tests/fixtures/ci-data.json") || exit 1
  while IFS= read -r -d '' f; do
    if grep -qE '\{\{[^}]*\bonepassword[A-Za-z]*' "$f"; then
      skipped=$((skipped + 1))
      continue
    fi
    if chezmoi --config "$tmp/empty.toml" --source "$repo" execute-template --override-data "$data" \
      <"$f" >/dev/null 2>"$tmp/err"; then
      rendered=$((rendered + 1))
    else
      echo "FAIL - ${f#"$repo"/} (is_wsl=$wsl): $(head -c 300 "$tmp/err" | tr '\n' ' ')"
      fails=$((fails + 1))
    fi
  done < <(find "$repo/home" -type f -name '*.tmpl' -print0)
done

echo "rendered $rendered, skipped $skipped (1Password), failed $fails"
[ "$fails" -eq 0 ]
