# Claude Code, Statusline, and Orca Process Churn on macOS

> **Type:** Reference (research note)
> **Date:** 2026-09-15
> **Scope:** How this repo's Claude Code configuration (hooks, plugins, statusline) and the Orca agent IDE generate short-lived processes on an Apple Silicon Mac, and which configuration levers reduce that churn. Versions pinned: Claude Code 2.1.272, ccstatusline 2.2.27 (bun cache), worktrunk v0.77.0, Orca 1.4.201 (commit `a1d135e233b1`, from `/Applications/Orca.app/Contents/Resources/orca-local-build.json`). Every claim cites a primary source (official docs, source at a pinned ref, changelog, the tool's own issue tracker) or a file in this repo. Claims that could not be traced are marked **unverified**.

Citation shorthand:

- `hooks-docs` = https://code.claude.com/docs/en/hooks (fetched 2026-09-15)
- `statusline-docs` = https://code.claude.com/docs/en/statusline
- `settings-ref` = https://code.claude.com/docs/en/settings-reference
- `agent-view-docs` = https://code.claude.com/docs/en/agent-view
- `env-vars-docs` = https://code.claude.com/docs/en/env-vars
- `CC-CHANGELOG vX` = https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md, entry under release X
- `orca-src:` = https://github.com/stablyai/orca/blob/a1d135e233b12f831da4137544de6654679acc8e/
- `wt-src:` = https://github.com/max-sixty/worktrunk/blob/v0.77.0/
- `merge-tmpl` = `home/.chezmoitemplates/claude-settings-merge` in this repo

---

## Baseline: the problem being solved

A diagnosis on this machine (2026-09-15) found RAM, swap, thermals, and disk healthy, CPU 64–81 % idle, but load average near 15 on 10 cores, roughly 110 new PIDs per second while Claude sessions were active against about 13 per second when quiet, and 17 % system time with `syspolicyd` and `XprotectService` visible. The symptom is exec churn, not memory or sustained CPU. The measured per-source counts are local observation, not a primary source; the rest of this note explains them from source and docs.

---

## 1. Claude Code hooks

### 1.1 Matching, parallelism, and cost

- **Matcher semantics.** `"*"`, `""`, or an omitted matcher matches every occurrence of the event. A matcher containing only letters, digits, `_`, `-`, spaces, `,`, and `|` is an exact string or list of exact strings. Anything else is an unanchored JavaScript regular expression (`hooks-docs`, "Matcher patterns").
- **All matching hooks run in parallel.** An identical handler defined in more than one settings file runs once; a plugin's copy of the same handler stays separate (`hooks-docs`, "Hook handler fields" preamble: "All matching hooks run in parallel. If you define the same handler in more than one settings file, it runs once."). Parallelism shortens wall time but not the process count: every matching handler is its own spawn.
- **The `if` field is the documented process-spawn filter.** It takes one permission rule (`"Bash(git *)"`, `"Edit(*.ts)"`) and is evaluated before spawning. It applies only to `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, and `PermissionDenied`; on other events a hook with `if` never runs (`hooks-docs`, "Common fields"). The docs' worked example states that a non-matching `if` means the script "would never run, avoiding the process spawn overhead" (`hooks-docs`, the introductory walkthrough of a `Bash(rm *)` hook, before "Configuration"). The changelog introduced it for the same reason: "Added conditional `if` field for hooks … reducing process spawning overhead" (CC-CHANGELOG v2.1.85). The filter is best-effort: when Claude Code cannot tell which command a Bash input runs (`$TOOL git push`), it runs the hook anyway (`hooks-docs`, Bash `if` matching table).
- **Timeouts.** Default `timeout` is 600 s for `command`, `http`, and `mcp_tool` hooks, lowered to 30 s on `UserPromptSubmit`. `SessionEnd` hooks share a 1.5 s budget, raised to match a longer per-hook `timeout` up to 60 s (`hooks-docs`, "Common fields"; CC-CHANGELOG v2.1.268 for the environment-variable override).
- **Async hooks do not reduce spawns.** `"async": true` runs a command hook in the background so Claude does not wait. Its decision fields have no effect, and Claude Code does not enforce `timeout` on it (`hooks-docs`, "Run hooks in the background"). `asyncRewake` also runs in the background and wakes Claude on exit code 2 (`hooks-docs`, "Command hook fields"). Both change latency only; the process still starts on every matching event.
- **No per-hook disable.** `disableAllHooks` turns off all hooks, the custom status line, and the custom file-suggestion command at once. The docs state: "There is no way to disable an individual hook while keeping it in the configuration" (`hooks-docs`, "Disable or remove hooks"; `settings-ref`, `disableAllHooks`).

### 1.2 Which shell runs a hook, and whether `bash -c 'node …'` is needed

- **Shell form** (no `args`): the `command` string goes to `sh -c` on macOS and Linux, or Git Bash on Windows. The shell expands variables and interprets pipes (`hooks-docs`, "Exec form and shell form"). On this machine `/private/var/select/sh` links to `/bin/bash`, so `sh` is bash in POSIX mode (local `ls -l`).
- **Exec form** (`args` present): `command` is resolved on `PATH` and spawned directly with no shell. Only the path placeholders `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, and `${CLAUDE_PLUGIN_DATA}` are substituted, as plain strings (`hooks-docs`, "Exec form and shell form"). Arbitrary expansions such as `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` are not performed in exec form, because no shell is involved (same section). The `args` field shipped in CC-CHANGELOG v2.1.139.
- **Consequence for this repo.** Every managed hook is written as `bash -c 'node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/X.js"'` (`merge-tmpl`:83–248). Claude Code already wraps shell form in `sh -c`, so each handler is `sh` → `bash` → `node`: up to three exec images where one suffices. Whether bash's single-command exec optimisation collapses any of these layers is **unverified**. The inner `bash -c` adds nothing, because `sh -c` already expands `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. On Windows, shell form runs under Git Bash (`hooks-docs`), which also expands it.

### 1.3 What fires on one tool call here

This inventory comes from the live `~/.claude/settings.json` (jq dump, 2026-09-15) and the enabled plugins' `hooks.json`. It is a count of handlers, not a measurement.

| Event, tool | Handlers (source) |
| --- | --- |
| PreToolUse, Bash | `pre-bash-dispatcher.js`, `git-commit-precheck.sh`, `block-secrets.js`, `warn-worktree-convention.js` (managed, `merge-tmpl`:88–111); Orca `*` hook; hookify `pretooluse.py` (no matcher) |
| PreToolUse, Edit/Write | `block-secrets.js` (managed); `warn-edit-on-protected.js` (live only, not in `merge-tmpl`); Orca `*` hook; hookify |
| PostToolUse, any | Orca `*` hook; hookify `posttooluse.py`; remember `post-tool-hook.sh` (no matcher) |
| PostToolUse, Edit/Write | adds `post-edit-format.js` (managed) and security-guidance `security_reminder_hook.py` (matcher `Edit\|Write\|MultiEdit\|NotebookEdit`) |
| PostToolUse, Read | adds `warn-derived-artifact.js` (managed) |
| UserPromptSubmit | `user-prompt-drift-check.js` (managed); Orca; hookify; remember; security-guidance; caveman `caveman-mode-tracker.js` |
| Stop / SubagentStop | Orca; hookify `stop.py` (Stop); security-guidance with `asyncRewake` on both |

Summing launchers gives about 25–30 processes for a Bash call: the managed hooks' `sh`/`bash`/`node` triples, Orca's wrapper script (§5.1), and hookify and remember interpreters. That matches the measured figure. The arithmetic is derived, not measured per handler.

### 1.4 Removed hooks persist in live settings

`merge-tmpl` is a chezmoi `modify_` template (`home/dot_claude/modify_settings.json.tmpl`:1). chezmoi passes the current file on stdin and uses the script's stdout as the new contents (https://www.chezmoi.io/user-guide/manage-different-types-of-file/, "modify scripts"). The jq merge keeps runtime hook arrays verbatim and appends a managed hook only when its command string is absent (`merge-tmpl`:322–328). Deleting a hook from the template therefore never deletes it from `~/.claude/settings.json`. The template already works around this with explicit tombstones: `map(select(.command != …))` for the old SessionStart rename (`merge-tmpl`:343–345) and `contains("stop-end-of-turn.js") | not` for the Stop hook (`merge-tmpl`:349–351). `warn-edit-on-protected.js` has no tombstone, so it still runs on every Edit/Write (live settings). Its script is still on disk at `~/.claude/hooks/warn-edit-on-protected.js` (local `ls`).

The `SessionEnd` hook at `merge-tmpl`:268 calls `~/.local/bin/claude-log-session` and `~/.local/bin/claude-board`, and neither exists on this machine (local `ls`). It costs one shell plus `jq` per session end and does nothing useful.

---

## 2. Status line

### 2.1 Claude Code's side

- **Triggers.** The command re-runs on event-driven updates, when a `refreshInterval` timer elapses, and when a warm prompt cache in the last payload reaches `expires_at` (`statusline-docs`, "How status lines work").
- **Debounce and cancellation.** "Claude Code debounces updates at 300ms … If a new update triggers while your script is still running, Claude Code cancels the in-flight script" (`statusline-docs`, same section). A slow status line is started and killed repeatedly during active tool use rather than skipped.
- **`refreshInterval`** is optional, in seconds, minimum `1`. "Leave it unset to run only on events" (`statusline-docs`, "Manually configure a status line"; `settings-ref`, `statusLine`; added CC-CHANGELOG v2.1.97). This repo sets none (`merge-tmpl`:275–279), which is the cheapest choice. ccstatusline's installer writes `refreshInterval: 10` when it configures Claude Code (`settings.statusLine.refreshInterval = existingRefreshInterval ?? 10` in the 2.2.27 bundle, `~/.bun/install/cache/ccstatusline@2.2.27@@@1/dist/ccstatusline.js`), so re-running its TUI installer would add a 10-second timer.
- **Data already in the stdin JSON, needing no spawn.** `model.display_name`, `workspace.current_dir`, `workspace.git_worktree`, `workspace.repo.{host,owner,name}`, `cost.*`, `context_window.*` including `used_percentage`, `rate_limits.five_hour` and `seven_day` with `used_percentage` and `resets_at`, `prompt_cache`, `pr.number` and `pr.url`, and `worktree.branch` (`statusline-docs`, "Available data"). There is **no** git branch or dirty-state field, apart from `worktree.branch` inside `--worktree` sessions. Branch and change counts still need `git`.
- **Disabling.** `disableAllHooks: true` also disables the custom status line (`settings-ref`, `disableAllHooks`).

### 2.2 ccstatusline

- **Launcher cost.** The ccstatusline README recommends a pinned global install and says "Dropping `@latest` is worth about 430 ms per repaint" with Bun (https://github.com/sirmalloc/ccstatusline, README, fetched 2026-09-15). This repo runs `bun x -y ccstatusline@latest` (`merge-tmpl`:277). Bun's own docs say only that `bunx` "checks for a locally installed package first, then falls back to auto-installing it from npm" and caches packages globally (https://bun.com/docs/pm/bunx). They do not document registry revalidation for `@latest` or a `-y` flag, so the mechanism behind the 430 ms is **unverified** beyond ccstatusline's own statement.
- **Custom-command widgets run synchronously, one after another.** The 2.2.27 bundle calls `execSync(item.commandPath, { input: jsonInput, timeout, … })` with `timeout = item.timeout ?? 1000` (bundle, `CustomCommand` widget `render`). Each custom-command widget is a blocking child process (`/bin/sh -c …`, per Node `execSync` semantics) inside every status line run.
- **Git widgets** spawn `git` with `--no-optional-locks` and cache output under `~/.cache/ccstatusline/git-cache` with a TTL and mtime checks (README, "Performance"). The cache TTL value was not traced in the bundle: **unverified**.
- **This repo's widget set** (`home/dot_config/ccstatusline/settings.json`):
  - `git-branch` and `git-changes` (lines 35–53): `git` spawns, cached.
  - `cat ~/.cache/claude/board-status.txt` (lines 76–81): one shell plus `cat` per run. The file does not exist on this machine, because its producer `claude-board` is missing (§1.4).
  - `bun x -y ccusage statusline` (lines 84–90): a second `bun x` resolution plus a full ccusage run. It duplicates the built-in `session-cost` widget (line 68) and Claude Code's own `cost.*` and `rate_limits.*` fields.
  - `wt list statusline --format=claude-code` (lines 93–99): see §2.4.

### 2.3 ccusage statusline

ccusage documents `bun x ccusage statusline` (or `npx -y ccusage statusline`) as the command. It reads session data from stdin and by default "uses offline mode with cached pricing data", with `--no-offline` to fetch pricing. No TTL or refresh flags are documented (https://ccusage.com/guide/statusline). Offline mode removes network latency but not the `bun x` launch or the transcript scan.

### 2.4 worktrunk `wt list statusline`

- `wt list statusline --help` (v0.77.0) says the line "carries the same cells as the worktree's row in wt list" and "A stale CI status cache makes it reach the network for a second or two, so it fits a statusline the host renders in the background."
- **`[list] full` and `summary` do not apply.** `statusline_options` hard-codes `ColumnGates { show_full: true, summary_enabled: false, has_llm_command: false, … }`: "CI runs, summary doesn't" (wt-src:src/commands/statusline.rs, `statusline_options`, around lines 861–875). The statusline therefore always collects CI status and never LLM summaries, whatever `home/dot_config/worktrunk/config.toml`:22–28 says. Those settings affect interactive `wt list` only.
- worktrunk's Claude Code page shows `wt list statusline --format=claude-code` as the **entire** `statusLine.command`, not as a widget inside another status line (wt-src:docs/src/content/docs/claude-code.md, "Statusline (Claude Code only)", lines 143–165). In `claude-code` mode it already renders dir, branch, diff and ahead/behind state, CI, model, context gauge, and rate-limit pace (`--help`, "Output formats").

---

## 3. Claude Code background supervisor and warm spares

- **What it is.** A supervisor process runs background sessions; "Each session is its own Claude Code process under the supervisor". Finished or waiting sessions left unattached for about an hour are stopped (`agent-view-docs`, "The supervisor process"). The agent view pre-warms an idle worker for the next background session (CC-CHANGELOG v2.1.238), and warm-spare workers are released under memory pressure (CC-CHANGELOG v2.1.133). Before v2.1.214, parked idle sessions kept the daemon and a worker alive indefinitely (CC-CHANGELOG v2.1.214).
- **No sizing setting found.** `settings-ref`, `env-vars-docs`, `agent-view-docs`, and the changelog were searched for spare, pre-warm, and worker-count controls, and none was found. `claude daemon --help` (2.1.272) lists only `run`, `status`, `logs`, `uninstall`, and `stop` (`--any`, `--keep-workers`). A knob for pool size is **unverified / not found**.
- **All-or-nothing switch.** `disableAgentView: true`, or `CLAUDE_CODE_DISABLE_AGENT_VIEW=1`, turns off `claude agents`, `--bg`, `/background`, "and the on-demand supervisor" (`settings-ref`, `disableAgentView`; `env-vars-docs`). `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables `run_in_background`, auto-backgrounding, and Ctrl+B (`env-vars-docs`). Whether it also stops spare workers is **unverified**.
- **Manual reset.** `claude daemon stop --any` stops the supervisor and its background sessions; the next `claude agents` or `--bg` starts a fresh one (`agent-view-docs`, "Manage sessions from the shell").

---

## 4. Plugins

- **Disabling.** `enabledPlugins` maps `plugin@marketplace` to a Boolean; `/plugin disable` and `claude plugin disable` write that key (`settings-ref`, `enabledPlugins`; https://code.claude.com/docs/en/discover-plugins). Individual plugin hooks cannot be disabled (§1.1).
- **Repo interaction.** `enabledPlugins` is rendered from `home/.chezmoidata/claude.toml` (`merge-tmpl`:280–285), but the merge lets the runtime value win on scalar conflicts (`merge-tmpl`:12, 318–320). Changing `true` to `false` in `claude.toml` does not disable a plugin that is already `true` in live settings. Forcing it needs a pin after the merge, as `autoMemoryEnabled` does (`merge-tmpl`:356–359), or a one-off `/plugin disable`.
- **hookify** (installed version `da823e86c8fe`). Its `hooks.json` registers `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/<event>.py"` with no matcher on PreToolUse, PostToolUse, Stop, and UserPromptSubmit (`~/.claude/plugins/cache/claude-plugins-official/hookify/<version>/hooks/hooks.json`). Each run imports the plugin core, globs `.claude/hookify.*.local.md` relative to the cwd, and evaluates the empty rule set (`hooks/pretooluse.py`:43–51; `core/config_loader.py`, `load_rules`). With no rule files, every tool call starts two Python interpreters (pre and post) that return an empty result. Enabled via `home/.chezmoidata/claude.toml`:47.
- **remember** (0.32.0). It registers `bash "${CLAUDE_PLUGIN_ROOT}/scripts/post-tool-hook.sh"` on PostToolUse with no matcher, plus SessionStart, UserPromptSubmit, and SessionEnd (`~/.claude/plugins/cache/claude-plugins-official/remember/0.32.0/hooks/hooks.json`). The script's header says it "Fires after every Claude Code tool call", counts new transcript lines, and starts `save-session.sh` in the background past a threshold (`scripts/post-tool-hook.sh`:6–10). Per call it sources several helper libraries, runs `wc -l` on the transcript (line 589), may run `ls -t … | head -1` (line 503), may fall back to a Python `read-position` helper (line 830), and launches a `nohup` save when the delta is large (line 936). Enabled via `claude.toml`:68.
- **security-guidance** (2.0.8). Its PostToolUse Bash handlers are already gated with `if` (`Bash(git commit:*)`, `Bash(git push:*)`, and similar) and `asyncRewake`. Its Edit/Write PostToolUse, UserPromptSubmit, Stop, and SubagentStop handlers are not gated, and each runs `bash sg-python.sh security_reminder_hook.py` (plugin `hooks/hooks.json`:15–122). Enabled via `claude.toml`:59.
- **caveman** (2.6.0). One `node` on SessionStart and one per UserPromptSubmit, each behind a `printf | sed` pipeline inside the shell-form command (`.claude-plugin/plugin.json`:9–34). The cost is per prompt, not per tool call. Enabled via `claude.toml`:96.

---

## 5. Orca

### 5.1 Agent hooks injected into Claude Code

- Orca writes a managed lifecycle hook into Claude's `settings.json` and a managed script, and (for Claude only) a managed status-line entry. A user who deletes the status-line entry is treated as opted out through a marker file (orca-src:src/main/claude/hook-service.ts, `install()` and `installManagedStatusLine`, lines 200–255). Live settings here carry the Orca entry on 13 events, with matcher `*` on PreToolUse, PostToolUse, PostToolUseFailure, and PermissionRequest (live settings jq dump).
- **Per-invocation cost on macOS.** The injected shell-form command is a long `case` wrapper that ends in `/bin/sh "$HOME/.orca/agent-hooks/claude-hook.sh"` (live settings). The script prints `{}`, reads stdin with `cat`, and exits early when `ORCA_AGENT_HOOK_PORT`, `ORCA_AGENT_HOOK_TOKEN`, or `ORCA_PANE_KEY` is unset. When they are set, it pipes `printf | base64 | tr` and posts to `127.0.0.1` with `curl` (0.5 s connect, 1.5 s max). On failure it spools to disk, skipping PreToolUse and PostToolUse (`~/.orca/agent-hooks/claude-hook.sh`:1–67). A Claude session **not** launched by Orca therefore still pays `sh` + `sh` + `cat` on every tool call. An Orca-launched session pays about six processes per event.
- **No opt-out setting found.** Code search on `stablyai/orca` for an enable or disable flag around agent-hook installation found none, and the trigger for `install()` was not traced. A supported way to stop Orca re-adding the hooks is **unverified / not found**.

### 5.2 Computer Use permission helper relaunches

- Each permission-status check launches the helper **app** through LaunchServices: `spawn('/usr/bin/open', ['-n', helperAppPath, '--args', '--permission-status-file', statusPath])`, then polls for the status file every 100 ms, up to 50 attempts. The source comment explains that TCC status must be read under the helper app's identity (orca-src:src/main/computer/macos-computer-use-permission-status.ts:77–110). `open -n` always starts a new instance.
- **Callers.** The IPC handler `computerUsePermissions:getStatus` (orca-src:src/main/ipc/computer-use-permissions.ts:21–27) is called from:
  - the Settings → Computer Use pane on mount and on every window `focus` event, a design chosen "instead of polling while the settings pane is open" (orca-src:src/renderer/src/components/settings/ComputerUsePane.tsx:176–191);
  - the setup-guide progress hook on activation and on every `focus` and `visibilitychange`-to-visible event, while the Computer Use skill is installed and the guide's core state is refreshing (orca-src:src/renderer/src/components/setup-guide/use-setup-guide-progress.ts:204–236).
- **No timer found.** Neither caller uses an interval, so a steady ~5 s relaunch cadence is not explained by a timer in these files. One hypothesis fits the source: each `open -n` launch may shift focus, and Orca regaining focus fires another check, forming a loop. It is **unverified**.
- **Known issue.** stablyai/orca#9141 (open) reports Computer Use spawning about 200 unmanaged helper instances in 3 hours, one roughly every 54 s, that RunningBoard does not memory-manage (https://github.com/stablyai/orca/issues/9141). #20078 (open) reports the helper losing its Accessibility grant after every update (https://github.com/stablyai/orca/issues/20078).

### 5.3 Process-table polling

- Orca captures the process table with `ps -axo pid=,ppid=,pgid=,tpgid=,stat=,lstart=` on macOS (the "cheap" column set; orca-src:src/shared/process-table-snapshot.ts:35–38). Captures are coalesced by a TTL reader, and a cached capture may be at most 500 ms stale (orca-src:src/shared/process-table-snapshot.ts:129–135; orca-src:src/shared/cheap-process-table-snapshot-reader.ts:16–47).
- Callers include PTY foreground-process inspection (orca-src:src/main/providers/local-pty-foreground-inspection.ts) and daemon terminal-host inspection (`src/main/daemon/terminal-host-process-inspection.ts`, found by code search). The polling interval that drives about one `ps` per second was not traced: **unverified**.
- `gh pr view` and `gh api` calls live under `src/main/github/client/` (code search). Their polling cadence was not traced: **unverified**.

---

## 6. macOS exec cost

- Apple: "XProtect checks for known malicious content whenever: An app is first launched, An app has been changed (in the file system), XProtect signatures are updated" (https://support.apple.com/guide/security/protecting-against-malware-sec469d47bd8/web). "All software in macOS is checked for known malicious content the first time it's opened, regardless of how it arrived on the Mac" (https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web).
- `syspolicyd` "serves as a general oracle that other system components may use to determine the system policy's verdict on a proposed operation", including what may be "executed" (`man 8 syspolicyd`).
- Apple publishes no per-exec cost figures, and whether repeated execs of an already-seen binary go through `syspolicyd` or XProtect is **unverified** from primary sources. The consistent lever is fewer exec calls, and in particular fewer *new* executables. `bun x` package resolution and `open -n` app launches are the likeliest to count as "first launch" or "changed" events. That is an inference, **unverified**.

---

## 7. chezmoi: removing entries from a merged file

- `modify_` scripts receive the target's current contents on stdin; stdout becomes the new contents. `chezmoi:modify-template` and `setValueAtPath` exist for partial edits of JSON, TOML, and YAML (https://www.chezmoi.io/user-guide/manage-different-types-of-file/).
- `.chezmoiremove` deletes whole **files**, not keys inside a file (same page, "Remove files").
- The only removal mechanism for a key or hook inside `settings.json` is therefore the jq stage of `merge-tmpl` itself. The file already uses two patterns: exact-command filtering (`merge-tmpl`:343–345) and substring filtering (`merge-tmpl`:349–351). A generic alternative is to strip, before the merge, every live hook whose command references this repo's hook directory (`/hooks/` under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`) but is absent from the managed set. Managed hooks would then be owned outright while plugin and Orca entries stay untouched. That design is not implemented anywhere, and its handling of edge cases is **unverified**.

---

## Recommended changes, ranked by impact

Impact ranks by the number of processes removed per tool call or per status-line run, taken from §1.3 and §2. None of these changes has been applied or measured.

1. **Replace the status line launcher and trim its widgets.** File: `merge-tmpl`:275–279 and `home/dot_config/ccstatusline/settings.json`.
   - Install ccstatusline globally at a pinned version (mise or `bun add -g ccstatusline@2.2.27`) and set `"command": "ccstatusline"`. This removes a `bun x @latest` resolution on every repaint, which ccstatusline puts at about 430 ms (§2.2).
   - Delete the `bun x -y ccusage statusline` widget (lines 84–90). Cost and rate limits already arrive in stdin (§2.1), and the `session-cost` widget shows cost.
   - Delete the `board-status.txt` widget (lines 76–81), whose source file does not exist.
   - Either keep `wt list statusline` and drop `git-branch`/`git-changes`, whose data it already renders, or use `wt list statusline --format=claude-code` as the whole `statusLine.command` as worktrunk documents (§2.4).
   - Keep `refreshInterval` unset (§2.1).
2. **Disable hookify while no rules exist.** File: `home/.chezmoidata/claude.toml`:47 (`false`), plus a post-merge pin in `merge-tmpl` or a one-off `/plugin disable hookify@claude-plugins-official`, because runtime wins on scalars (§4). Removes two Python interpreters per tool call and one per prompt and per Stop. Re-enable when a `.claude/hookify.*.local.md` rule is written.
3. **Drop the `bash -c` layer from every managed hook.** File: `merge-tmpl`:83–248. Write `node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/X.js"` directly in shell form. `sh -c` still expands the variable, and Git Bash on Windows does too (§1.2). This removes one exec per managed handler, four on a Bash PreToolUse. A further step is exec form with a chezmoi-rendered absolute path (`"command": "node", "args": ["{{ .chezmoi.homeDir }}/.claude/hooks/X.js"]`). That removes the shell too, but gives up the `CLAUDE_CONFIG_DIR` fallback, because exec form does not expand it (§1.2). Changing command strings means the add-only merge keeps the old strings, so land this together with item 4.
4. **Tombstone retired managed hooks.** File: `merge-tmpl` jq stage, next to lines 343–351.
   - Strip `warn-edit-on-protected.js` from `.hooks.PreToolUse`.
   - Remove the SessionEnd `claude-log-session`/`claude-board` entry from the template (line 268) and tombstone it.
   - Adopt a generic prune of managed-directory hooks absent from the managed set, so that future renames (including item 3) do not double-fire (§7).
5. **Gate managed hooks with `if` and consolidate per event.** File: `merge-tmpl`:88–111. Give `git-commit-precheck.sh` `"if": "Bash(git commit *)"`, which is best-effort (§1.1). Consider folding `block-secrets.js` and `warn-worktree-convention.js` for Bash into `pre-bash-dispatcher.js` so one `node` serves the Bash PreToolUse. The dispatcher's current contents were not reviewed for this note.
6. **Decide on remember's per-call hook.** File: `home/.chezmoidata/claude.toml`:68. It is a full bash script with several subprocesses on every tool call (§4). Individual plugin hooks cannot be disabled, so the choice is keep or disable the plugin. Same pinning caveat as item 2.
7. **Orca Computer Use.** Not a repo file.
   - Keep Orca's Settings → Computer Use pane closed, and finish or dismiss the setup guide, since both re-run the `open -n` helper on focus events (§5.2).
   - If Computer Use is not needed, remove the Computer Use skill, which gates the setup-guide check (§5.2), and quit the leftover `orca-computer-use-macos` instances.
   - Report the relaunch cadence upstream with reference to #9141.
8. **Orca agent hooks outside Orca.** Not a repo file. No opt-out was found (§5.1). Removing the entries by hand costs three processes per tool call in non-Orca sessions, but Orca may re-add them. Check whether it does before scripting a removal, and do not add Orca entries to `merge-tmpl` tombstones until the reinstall trigger is known.
9. **security-guidance and caveman.** Leave as is. security-guidance already gates its Bash hooks with `if`, and caveman costs one `node` per prompt (§4). Revisit security-guidance's ungated Stop and SubagentStop `asyncRewake` Python runs if churn persists.
10. **Background supervisor.** No sizing control exists (§3). Use `claude daemon stop --any` to drop accumulated workers, or set `disableAgentView` only on a machine that does not use background agents. That is a feature trade, not a tuning knob.

---

## Unverified / open

- Whether bash exec-optimises `bash -c 'node …'` or `sh -c 'bash -c …'` so that fewer than three images start per managed hook.
- Whether handlers repeated across matcher groups *within one settings file* are deduplicated. The docs mention only duplicates across settings files (§1.1).
- The mechanism behind ccstatusline's "about 430 ms per repaint" for `@latest` under `bun x`, and whether `bun x` contacts the registry on every run. Bun's docs are silent, and `-y` is not a documented `bunx` flag.
- ccstatusline's git-cache TTL value.
- A Claude Code setting for the number of warm spare or bg-pty-host workers, and whether `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` affects spares.
- What triggers Orca's hook `install()`, and whether it re-adds hooks removed by hand; any user-facing toggle for agent hooks.
- The cause of the observed ~5 s `Orca Computer Use.app` relaunch cadence. The focus-loop hypothesis in §5.2 is untested.
- The intervals behind Orca's ~1 Hz `ps` capture and its `gh pr view` / `gh api` polling.
- Whether repeated execs of known binaries incur `syspolicyd` or XProtect evaluation (§6).
- Out of scope, not researched: the audio stack (coreaudiod, SoundSource, a microphone keep-warm LaunchAgent), Shortcuts background runners, and CodexBar's adaptive polling, all observed during diagnosis.
