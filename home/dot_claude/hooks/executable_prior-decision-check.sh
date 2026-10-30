#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|NotebookEdit|Bash): before the first change a session makes to a file
# outside the repo it is working in, show what other sessions in the last 2 days decided about that
# file, and stop once so it is read. The session's own repo is left alone, so day-to-day work in it
# is not interrupted; changes to other repos and loose files are where sessions undo each other.
# A Bash call counts only when it writes: a git commit (its staged files), or a copy, move, delete,
# link, tee, redirect or in-place edit naming a file. Folders are skipped. Plain search, no model:
# a decision is a line that names the file and says it was deleted, retired, removed, cut, replaced,
# kept, reverted or decided. Each file is flagged once per session; the retry goes through.
set -uo pipefail
command -v jq >/dev/null && command -v rg >/dev/null || exit 0

input=$(cat)
sid=$(jq -r '.session_id // empty' <<<"$input")
tool=$(jq -r '.tool_name // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$sid" ] || exit 0

# The repo a path belongs to, compared by git's shared directory so all worktrees of one repo match.
repo_of() {
  local d=$1
  while [ ! -d "$d" ] && [ "$d" != / ]; do d=$(dirname "$d"); done
  git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null
}
home_repo=$(repo_of "${cwd:-/}")
outside() { [ -z "$home_repo" ] || [ "$(repo_of "$1")" != "$home_repo" ]; }

paths=()
case "$tool" in
  Edit | Write | NotebookEdit)
    p=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    [ -n "$p" ] && outside "$p" && paths+=("$p") ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    if [[ $cmd =~ git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit ]]; then
      dir=$cwd; [[ $cmd =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && dir=${BASH_REMATCH[1]/#\~/$HOME}
      top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) && outside "$top" &&
        while IFS= read -r f; do paths+=("$top/$f"); done < <(git -C "$top" diff --cached --name-only 2>/dev/null)
    fi
    # Other commands count only when they write.
    writes='(^|[;&|[:space:]])(cp|mv|rm|ln|tee|install|truncate)[[:space:]]|sed[[:space:]]+-i|>[^&]'
    if [[ $cmd =~ $writes ]]; then
      for w in $cmd; do
        w=${w//[\"\']/}; w=${w#\>}; w=${w%%[;&|)]*}; w=${w/#\~/$HOME}
        [[ $w == /* ]] && outside "$w" && paths+=("$w")
      done
    fi ;;
esac
[ ${#paths[@]} -gt 0 ] || exit 0

# The file's own name, without chezmoi's source prefixes and suffixes.
name_of() {
  local b=${1##*/}
  b=${b%.tmpl}; b=${b%.age}
  while :; do case $b in executable_* | private_* | encrypted_* | readonly_* | dot_*) b=${b#*_} ;; *) break ;; esac; done
  printf '%s' "$b"
}

state="${XDG_STATE_HOME:-$HOME/.local/state}/prior-decision-check"
mkdir -p "$state"
seen="$state/$sid"
names=()
for p in "${paths[@]}"; do
  [ -d "$p" ] && continue
  case $p in /tmp/* | /dev/* | /proc/*) continue ;; esac
  n=$(name_of "$p")
  # Generic names say nothing about one decision.
  case $n in '' | config.toml | settings.json | SKILL.md | README.md | AGENTS.md | CLAUDE.md | work.toml | index.md | pre-commit | commit-msg) continue ;; esac
  [ ${#n} -ge 5 ] || continue
  grep -qxF "$n" "$seen" 2>/dev/null && continue
  names+=("$n")
done
[ ${#names[@]} -gt 0 ] || exit 0
# A command that names one file twice gets one section for it.
sorted=(); while IFS= read -r l; do sorted+=("$l"); done < <(printf '%s\n' "${names[@]}" | sort -u)
names=("${sorted[@]}")

files=(); while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$HOME/.claude/projects" -name '*.jsonl' \
  -mmin -2880 -not -name "$sid.jsonl" -not -path "*/$sid/*" -print0 2>/dev/null)
[ ${#files[@]} -gt 0 ] || exit 0

decision='delet|retir|remov|\bcut\b|replac|drop|revert|decid|\bkeep\b|\bkept\b|never|stays|no longer|instead'
report=""
for n in "${names[@]}"; do
  echo "$n" >>"$seen"
  hits=$(printf '%s\0' "${files[@]}" | xargs -0 rg -l -F -- "$n" 2>/dev/null | while IFS= read -r f; do
    s=$(basename "$f" .jsonl); case $f in (*/subagents/*) s=$(basename "$(dirname "$(dirname "$f")")") ;; esac
    [ "$s" = "$sid" ] && continue
    jq -r --arg n "$n" --arg s "${s:0:8}" --arg d "$decision" '
      select(.type == "assistant" or .type == "user")
      | . as $e
      | [ (.message.content | if type == "string" then . else ([.[]? | select(.type == "text") | .text] | join("\n")) end) ]
      | .[0] | split("\n")[] | select(contains($n)) | select(test($d; "i"))
      | select(test("^<|system-reminder|Another Claude session") | not)
      | "\($e.timestamp[0:16]) \($s) \($e.type): \(gsub("\\s+"; " ") | .[0:220])"' "$f" 2>/dev/null
  done | sort -r | awk '!seen[substr($0, 18)]++' | head -6)
  [ -n "$hits" ] && report+="${n}:"$'\n'"${hits}"$'\n'
done
[ -n "$report" ] || exit 0

reason="Other sessions in the last 2 days decided things about the file(s) this call changes. Read them, and read those sessions if a decision conflicts, before going on; the same call goes through on retry.
${report}"
jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
