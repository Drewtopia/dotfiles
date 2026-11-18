Reference — Claude Code hooks

# Claude Code hooks

Scope: how the machine-global Claude Code hooks are wired from this repo, how the settings merge treats them, and which command forms the Bash guards refuse. Read before writing or debugging a hook, and when a Bash or Edit call is refused and the message does not say which form caused it. Hook behaviour is cited to code.claude.com/docs/en/hooks and /permissions; anything marked **observed** was seen in sessions, not read in docs or source.

## Layout and wiring

- Scripts live in `home/dot_claude/hooks/` (lands at `~/.claude/hooks/`), tests in `home/dot_claude/hooks/tests/`. The wiring is the managed `hooks` block in `home/.chezmoitemplates/claude-settings-merge`, which `home/dot_claude/modify_settings.json.tmpl` includes.
- Ids follow `<event>:<purpose>`, and the Bash checks `pre:bash:<check>` (`pre:bash:block-dangerous-git`, `stop:verify`). Turn one off with `HOOKS_DISABLED=<id>[,<id>]`, read by `isHookEnabled` in `lib/hook-flags.js`. Other shared helpers: `lib/hook-io.js` (stdin), `lib/git.js`, `lib/shell.js` (segment splitting, wrapper unwrapping, `cd` tracking), `lib/transcript.js`.

| Event | Matcher | Hook | Job |
|---|---|---|---|
| PreToolUse | `Bash` | `pre-bash-dispatcher.js` | Runs the Bash checks below in order; the first exit 2 blocks, and a check that throws also blocks |
| PreToolUse | `Bash`, `if: Bash(*git*)` | `git-commit-precheck.sh` | The harness commits with `core.hooksPath=/dev/null`, so this runs the repo's lefthook pre-commit and gitleaks on staged files, plus `public-leaks.gitleaks.toml` in a public GitHub repo |
| PreToolUse | `Bash\|PowerShell\|Monitor` | `dcg-unattended-ask.js` | In an unattended session (`claude -p`, SDK, scheduled runs) turns a dcg "ask" into a deny |
| PreToolUse | Artifact, Claude Docs, Azure DevOps `wit_` tools | `work-safety-ask.js` | Asks before creating an artifact or doc, or writing a work item |
| PreToolUse | `Edit\|Write` | `edit-governance-guard.cjs` | Denies edits to governance surfaces unless an unlocking command ran this session (also wired at UserPromptExpansion) |
| PreToolUse | `Edit\|Write` | `~/.hub/hooks/block-windows-root-files.cjs` | Lives in hub; skipped when the file is absent |
| PostToolUse | `Edit\|Write` | `post-edit-format.js` | Formats and lints the edited file; only a lint error on a changed line blocks |
| Stop | | `stop-verify.js` | Typechecks changed TypeScript in a moon workspace before the turn ends |
| SessionStart (not Windows) | | `worktree-guidance-topup.sh`, `session-start-mistakes.sh`, `session-start-behind.sh` | Guidance links in secondary worktrees, the repo's MISTAKES.md lessons, behind-upstream warning |
| CwdChanged | | `cwd-changed-worktree-check.js` | Warns on entering a main checkout that sits on a ticket branch |

dcg's own PreToolUse entry is not managed here: each dcg run rewrites it to its binary path.

### Shell form and `if`

- A hook without `args` runs under `sh -c` on macOS and Linux, and Git Bash on Windows (PowerShell only when Git Bash is missing). That shell already expands `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`, so a `bash -c 'node …'` wrapper is one extra process per hook. The merge carries a tombstone that strips the old wrapper forms.
- `if` (tool events only) holds one permission rule. It checks every subcommand of a compound command, and runs the hook anyway when it cannot split the command. Before matching it strips only a fixed wrapper set (`timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, bare `xargs`, known-safe env assignments), so `Bash(git *)` misses `/usr/bin/git commit` and `sh -c "git commit"`. That is why `git-commit-precheck.sh` uses `Bash(*git*)`.

### Plugin hook paths

A plugin cache path embeds the version (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/hooks/<script>`), and old versions stay beside new ones. With marketplace `autoUpdate: true` a pinned path dies silently at the next release. Glob and fail open:

```sh
sh -c 'h=$(ls -d "$HOME"/.claude/plugins/cache/<mp>/<plugin>/*/hooks/<script> 2>/dev/null | sort -V | tail -1); [ -x "$h" ] && exec "$h"; exit 0'
```

## How the settings merge treats hooks

- The merge keeps each live hook-event array as it is, and appends a managed hook only when its exact command string appears nowhere in that event's live array.
- It never collapses duplicates already in the live file. **Observed** on the Mac on 2026-11-15: live SessionStart holds three managed entries, so `worktree-guidance-topup.sh` is listed three times and `session-start-mistakes.sh` twice. Claude Code dedupes the same handler only across settings files, so these can run more than once per session start.
- The merge is add-only. A changed or retired command string needs a tombstone in the jq after `dm`, or old and new both fire.
- Scalars are runtime-wins, so a managed default reaches only machines that have not set their own. `statusLine`, `preferredNotifChannel`, `attribution` and a few plugin toggles are pinned after the merge.
- Test a merge change: `chezmoi --source <worktree> execute-template < home/dot_claude/modify_settings.json.tmpl > merge.sh`, run `bash merge.sh < <copy of live settings>`, then check the output is valid JSON, a second run is identical, and the hook commands differ only as intended.

## Which events can inject context

`hookSpecificOutput.additionalContext` reaches the model. A synchronous hook's `systemMessage` is shown to the user.

| Event | What reaches the model |
|---|---|
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `SubagentStart` | `additionalContext` |
| `Stop`, `SubagentStop` | `additionalContext` or `decision: "block"` with `reason`; both keep the turn going |
| `CwdChanged` | Nothing: no decision control. `cwd-changed-worktree-check.js` uses `systemMessage` |

- A check that should reach the model without keeping the turn going cannot sit at `Stop`. At `UserPromptSubmit` it fires at the top of the next turn instead.
- Common payload fields include `session_id`, `transcript_path`, `cwd` and `hook_event_name`. `permission_mode` is not sent to every event.

## Anchoring a check to what the session is for

- The native task list is on disk at `~/.claude/tasks/<session_id>/<n>.json` (`subject`, `description`, `status`, `blockedBy`) and readable from any hook, but it is almost always empty, because nothing in Drew's skills creates tasks.
- The working fallback is the transcript's opening ask. For a session started with a slash command, message one is the injected skill payload, so take its `ARGUMENTS:` line, which holds what the user typed.

## Writing a guard

- `lib/git.js`'s `currentBranch(cwd)` takes an optional path. A caller that omits it reads the hook process's working directory, which in a worktree session is not the repo a `git -C <other> …` or `cd <other> && …` command targets.
- Resolve the target the way `gate-commit-not-protected.js` and `block-dangerous-git.js` do with `lib/shell.js`: split into segments on `&&`, `||`, `;`, `|` and newlines; match only segments that start with git; unwrap `bash -c`, `sh -c`, `zsh -c`, `eval` and `xargs`, then rescan; honour the nearest preceding `cd`. `git -C <path> commit` stays allowed by design, because the caller named another repo.
- Anchor a matcher to the start of a segment. A substring match on `git commit` blocks any command that merely mentions it (an `echo`, a grep pattern, a test fixture).
- Diff old and new behaviour across a case table before shipping a matcher change: tightening a match to kill false positives once silently opened `bash -c "git commit"`.

## The Bash checks

`pre-bash-dispatcher.js` runs these in order:

| Id | Refuses |
|---|---|
| `pre:bash:block-dangerous-git` | A bare `git push` from `main`, `master` or `develop`, and a switch, branch-creating checkout or `branch -f` in a primary checkout that has linked worktrees. Splits the line per git call, so a branch named by another command is not read as the push's |
| `pre:bash:gate-governance-writes` | Common shell write forms against governance files. A tripwire: interpreter writes pass unseen |
| `pre:bash:gate-push-convention` | A push whose checked-out branch fails commit-check's Conventional Branch rules; allows when commit-check is absent |
| `pre:bash:gate-commit-not-protected` | A commit on a protected branch, resolved as above |
| `pre:bash:gate-blocked-issue-close` | `gh issue close <n>` while an issue listed after "Blocked by" is open; a failed lookup allows |
| `pre:bash:gate-uat-live-ports` | A UAT run or a kill of the live dev ports, unless a prompt this session named them; ports come from an untracked local file |
| `pre:bash:block-pipe-to-tail` | A test, build, lint or commit command piped to `tail` or `head` |
| `pre:bash:block-recursive-grep` | A recursive grep; use `rg` |

Elsewhere:

- Force-pushes, pushes naming a protected branch and destructive git commands belong to dcg (`core.git` plus `home/dot_config/dcg/packs/git-policy.yaml`).
- Secret files are covered by `permissions.deny` Read rules in the same template (filesystem-wide `//**/` patterns for `.env*`, `secrets*`, keys and credential files). A Read deny also denies Edit. These replaced the `block-secrets.js` hook.

## Claude Code's worktree-isolation guard

**Observed** through 2026-10, not a chezmoi hook and not in the docs: in a worktree session, including one the session did not create with `EnterWorktree`, Claude Code refuses some Bash forms as "too complex to verify" or "the repository it targets cannot be verified". It lifts once `ExitWorktree` returns the session.

Refused:

- `$(…)` or a variable where an option could stand (`VAR="$(fnox get X)" cmd`, `for f in …; do tail $f`); `sed -n` with a variable line range; `mise` or `fnox` with a loop variable or array element as an argument.
- `git -C <shared checkout>`; `cd <shared checkout> && git …`; `git` with `&&`; `xargs git` or any git fed on stdin; process substitution around git (`diff <(git show <ref>:<path>) <path>`); `git worktree add … && cd … && …`.
- A loop variable or branch name that expands to the word `git` counts as a second git (`chore/git-cliff-…`).
- `bash <script>`; `xargs` or `find -exec` running `sh`; `powershell.exe` or `cmd.exe` in a plain command; heredocs that `cd` first; several `cat > f <<'EOF'` heredocs in one call.
- Any `> file` redirect around `az` or `gh`; `az --query` with braces or inside a `for` loop; `$(cat file)` in a `gh` argument; a `gh` repo argument held in a variable inside a compound command; quoted JSON with spaces as an argument.
- `env -i HOME=…` ("sets HOME, injecting git configuration").

Passing:

- Literal arguments; one plain `git` command per call; a script written to a file and run by path.
- `mise exec -E <env> -- cmd`; `env -u VAR PATH=… bash -lc '…'`; Windows binaries by full path (`/mnt/c/Windows/System32/reg.exe`).
- `az … -o tsv --query "[].[a,b]"` with no redirect; `gh … --body-file <path>` with the owner and repo spelled out (`gh issue close` takes no body file, so comment first, then close).
- `git show <ref>:<path> > <tmp>` as one plain command, then a separate `diff` of two real files.
- The Write tool instead of heredocs; plain `cat`, `grep` and `sed` on absolute paths outside the worktree. Only git-ish and write-ish forms are gated.
- A pipe around git (`git show-ref | grep <word>`) has passed and been refused, so treat it as unreliable.

Working around it:

- Start a second worktree with `ExitWorktree` (keep), then `EnterWorktree name:<type/slug>`: the directory gets a dash, the branch keeps the slash.
- A background session cannot edit the shared checkout, even after `ExitWorktree`. For a gitignored file there, write the change to the job's temp dir and hand Drew a `!` command.

## Auto-mode refusals seen beside the hooks

**Observed**, from the auto-mode classifier rather than a hook:

- `kill` of another app's processes ("Interfere With Workloads").
- A perl bulk rewrite of the settings template ("Self-Modification"), even under a governance unlock; per-line Edit passed.
- A background `sleep 900; <run>` (a permission prompt, not the guard). Hand a long wait to Drew.
