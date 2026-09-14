#!/usr/bin/env bash
# PROTOTYPE sandbox: does chezmoi call `op` on status/diff/apply under each design?
set -u
R="$CLAUDE_JOB_DIR/tmp/sbx"
rm -rf "$R"; mkdir -p "$R/bin"

cat >"$R/bin/op" <<'EOF'
#!/usr/bin/env bash
echo "op $*  [SA=${OP_SERVICE_ACCOUNT_TOKEN:+set}]" >>"$OPLOG"
case " $* " in
  *" read "*) printf 'SECRET-%s' "${SECRET_VERSION:-v1}" ;;
  *" signin "*) printf 'fake-session' ;;
  *) : ;;
esac
EOF
chmod +x "$R/bin/op"
export PATH="$R/bin:$PATH" OPLOG="$R/op.log"

run() { # scenario cmd...
  local s="$1"; shift
  : >"$OPLOG"
  out=$(chezmoi --source "$R/$s/src" --config "$R/$s/chezmoi.toml" --destination "$R/$s/home" \
        --cache "$R/$s/cache" --persistent-state "$R/$s/state.boltdb" --no-tty --force "$@" 2>&1)
  rc=$?
  printf '%-10s %-28s rc=%s op-calls=%s\n' "$s" "$*" "$rc" "$(grep -c . "$OPLOG")"
  [ "$rc" -ne 0 ] && echo "   -> $(echo "$out" | tail -1)"
  grep -q . "$OPLOG" && sed 's/^/   | /' "$OPLOG"
  return 0
}

mk() { mkdir -p "$R/$1/src" "$R/$1/home"; }

# A: today's design — secret read in an ordinary template (account mode)
mk A
printf '[data]\n  x = 1\n' >"$R/A/src/.chezmoi.toml.tmpl"
echo 'export TOKEN={{ onepasswordRead "op://Employee/GitHub PAT/token" }}' >"$R/A/src/dot_vault.tmpl"

# W: work design — read once in config template, keep in local data
mk W
cat >"$R/W/src/.chezmoi.toml.tmpl" <<'EOF'
{{- $pat := "" -}}
{{- if and (hasKey . "githubPat") (not (env "DOTFILES_REFRESH_SECRETS")) -}}
{{-   $pat = .githubPat -}}
{{- else -}}
{{-   $pat = onepasswordRead "op://Employee/GitHub PAT/token" -}}
{{- end -}}
[data]
  githubPat = {{ $pat | quote }}
EOF
echo 'export TOKEN={{ .githubPat }}' >"$R/W/src/dot_vault.tmpl"

# P: personal design — service mode
mk P
printf '[onepassword]\n  mode = "service"\n' >"$R/P/src/.chezmoi.toml.tmpl"
echo 'export TOKEN={{ onepasswordRead "op://Dotfiles/GitHub PAT/token" }}' >"$R/P/src/dot_vault.tmpl"

echo "== A: today (account mode, read in template)"
run A init; run A status; run A diff; run A apply
echo "== W: work (read once at init)"
run W init; run W status; run W diff; run W apply
echo "   rendered: $(cat "$R/W/home/.vault")"
echo "   config perms: $(stat -f %Sp "$R/W/chezmoi.toml")"
SECRET_VERSION=v2 run W init
echo "   after plain re-init, secret rotated to v2: $(grep githubPat "$R/W/chezmoi.toml")"
SECRET_VERSION=v2 DOTFILES_REFRESH_SECRETS=1 run W init
echo "   after refresh re-init: $(grep githubPat "$R/W/chezmoi.toml")"
run W apply
echo "   rendered: $(cat "$R/W/home/.vault")"
echo "== P: personal (service mode)"
OP_SERVICE_ACCOUNT_TOKEN=ops_fake run P init
OP_SERVICE_ACCOUNT_TOKEN=ops_fake run P status
run P status   # token missing
echo "== A with token set in account mode"
OP_SERVICE_ACCOUNT_TOKEN=ops_fake run A status
