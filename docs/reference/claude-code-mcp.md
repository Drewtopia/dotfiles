Reference — Claude Code MCP servers

# Claude Code MCP servers

Scope: where Claude Code reads MCP config, how claude.ai connectors reach every machine and how to block them, what stdio servers cost per session, and how this repo gates servers per machine. Read before adding, blocking or debugging an MCP server, or when sessions are eating memory.

## Where config lives

- User-scope servers: top-level `mcpServers` in `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`). Local scope is `projects[<path>].mcpServers` in the same file.
- `~/.claude/mcp.json` is never read. This repo shipped one for months and none of its servers ever ran.
- `/mcp` toggles persist per project as `projects[<path>].disabledMcpServers` in `~/.claude.json`, so hiding a connector in one repo leaves it on everywhere else.
- Local scope set on a repo's main checkout applies in its `.claude/worktrees/*`; `~/.claude.json` holds no worktree project keys.
- `.claude/settings.local.json` is project scope only. There is no machine-wide local settings file. The only per-machine layer is managed policy (`/etc/claude-code/managed-settings.json`, `managed-settings.d/`, `/Library/Application Support/ClaudeCode/` on macOS). It is root-owned, an unreadable file makes claude.ai-login sessions exit at startup, and a higher managed source (server-managed from an org) makes the file ignored.

## claude.ai connectors

- They belong to the account, so they appear on every signed-in machine (`claude mcp list` shows `claude.ai <Name>`).
- Block all: `"disableClaudeAiConnectors": true` in any settings file (any source set to true wins), or `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
- Block some: `deniedMcpServers`, which merges from every settings scope and applies to connectors, plugin servers and user servers. Match on `{"serverUrl": "https://host/*"}` rather than the display name: names come from claude.ai and drift, and collisions gain ` (N)`. Hostname wildcards work (`https://*.supabase.co/functions/v1/open-brain-mcp*`).
- A connector added at claude.ai later is not blocked until it is listed.

## Probes

- Test a settings change without touching files: `claude --settings '{"deniedMcpServers":[...]}' mcp list`.
- `claude mcp get <name>` health-checks the server and launches stdio ones (about 1 s when missing, 2 s when present); `claude mcp list` checks all of them (3 s or more). For "is it configured", read names instead: `jq -r '.mcpServers // {} | keys[]' ~/.claude.json` (5 ms).

## Per-session cost

- Every stdio server is one process per session, and concurrent sessions multiply it: on one machine 14 live sessions carried about 7 GB of stdio servers. None were orphans. Claimed `bg-spare` sessions each start their own set, and a leftover terminal session keeps the servers it started even after they are removed from config.
- No setting starts servers lazily or skips background sessions. The levers are fewer sessions, fewer user-scope servers, subagent frontmatter `mcpServers` (connected only while that subagent runs), and `disabledMcpjsonServers` (which overrides `enableAllProjectMcpServers`).
- Prefer a CLI plus a skill over a server where one exists: the mise config installs `npm:@playwright/cli` for the playwright-cli skill so sessions do not each start a Playwright MCP server.
- Measure memory as process-tree RSS per server pattern. Measure use by counting `"type":"tool_use",…,"name":"mcp__<server>__` across `~/.claude/projects`.

## Server entries

- A stdio `command` resolves on the session's PATH snapshot, so give an absolute path. A bare command name can work only by accident, for example because the session started in a repo with `node_modules/.bin` on PATH.
- Before rewriting an entry's `command`, print `command` and `args`: an `npx <pkg>` entry carries the package in `args`, and keeping those args with a new command breaks the server (CONNECTION_CLOSED).
- The azure plugin covers Azure cloud resources only, with no Boards or DevOps tools. Boards go through `az boards` or the Azure DevOps MCP server.

## Gating in this repo

- Local servers: `[mcp_servers.<profile>.<name>]` in `home/.chezmoidata/ai/mcp.toml`, merged across the machine's profiles (`always`, `personal`, `dev_computer`, `work`) by `home/.chezmoitemplates/claude-mcp-servers`, then added by `home/.chezmoiscripts/common/run_onchange_after_56-add-claude-mcp-servers.{sh,ps1}.tmpl` with `claude mcp add -s user`. It is add-only: a name already in `~/.claude.json` is left as is, and deleting an entry does not remove it. Keep the empty `[mcp_servers]` header: the partial reads it under `missingkey=error`.
- Connector blocks: `deniedMcpServers` under `{{ if .work }}` in `home/.chezmoitemplates/claude-settings-merge`. The settings merge unions arrays, so un-blocking needs a tombstone.
- Open decision: one `[mcp.<name>] profiles = [...]` table driving both adds and blocks. Revisit at about five connectors or the first work-only local server.
