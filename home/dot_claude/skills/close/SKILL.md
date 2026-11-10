---
name: close
description: Close out this T3 thread so the next one starts in the right place. Commits, logs every mistake and correction to the repo's MISTAKES.md, files notes, names and settles the thread through the T3 MCP, and ends on a status block with one line per unfinished item. Use for /close, "close the session", "wrap up", "end session"; `/close full` runs every extra.
disable-model-invocation: true
---

# /close — thread closeout

Quick close runs every time and stays short: a heavy closeout is a closeout that gets skipped. Full extras run only when their trigger is present, or when invoked as `/close full`.

`/close` ends this thread only. It never removes a worktree or closes a stream's issue: `wt step land` (or `wt remove <branch>`) ends the stream once its PR merges, and `/reconcile-tracker` closes issues whose branch carries no `gh<n>`.

Global memory (`~/.claude/memory/`) lives in the vault, whose `main` is protected: edit it on a vault work branch and land it as `edit-governance` step 3 says. The git work in step 1 is for the **outer project repo**, not the vault.

## Quick close — every time

### 1. Commit

```bash
git rev-parse --show-toplevel 2>/dev/null
git status --short
git diff --stat HEAD
```

Not inside a git repo → skip to step 2. Clean tree → say so in one line and move on.

Dirty tree → read the full diff (`git diff HEAD`): hunks, not filenames.

- On `main`, `master`, or `develop`, the work belongs on its stream's branch; the `gate-commit-not-protected` hook blocks commits there. Find the stream with `wt list`, or name a new `<type>/<topic>` branch. In T3, `t3_worktree_status` says whether this thread has a worktree; `t3_worktree_handoff` moves the thread and its changes into a new one. Then commit there.
- Group hunks by **purpose**, not by file. One logical change → one commit; don't manufacture splits.
- For each group: state the paths and the commit message (conventional-commit prefix when it fits), confirm with Drew, stage only those paths (`git add -p` when hunks in one file split), commit.
- Do **not** push. Do **not** use `git add -A`.

### 2. Mistakes — every correction counts

The log is read back at every session start (the `session-start-mistakes` hook prints each heading and its **Prevention**), so an entry here is what stops the next session repeating it.

Read back through the thread for every time Drew corrected, redirected or re-asked, and every breakage the session caused. Each one is an entry, however small. "Drew had to say it twice" is a mistake.

Target the main checkout's log, never a worktree's copy (it is gitignored and dies with the worktree):

```bash
log="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/MISTAKES.md"
```

- Search the log first (`rg -n -i '<key words>' "$log"`). Same mistake already logged → add a line `**Recurred** — <date>: <one sentence>` under its entry instead of a new one, and give it a `Parked:` line in the status block: `Parked: /correct <entry heading>`, since a lesson that recurs needs a check, not more prose.
- New mistake → insert it below the `Newest first.` line:

```markdown
## <YYYY-MM-DD> <what went wrong, as a sentence>

**What happened** — <the action and Drew's correction>

**Root cause** — <why the agent did it>

**Consequence** — <what it cost Drew>

**Prevention** — <one imperative rule a future session can follow, naming the check or command>
```

Keep **Prevention** to one short paragraph followed by a blank line: it is the only part the hook shows. No log file yet → ask Drew before creating it (a new Markdown file); on yes, it opens with `# MISTAKES.md`, a blank line, `Newest first.`, and a repo that tracks files needs `/MISTAKES.md` in its `.gitignore`.

### 3. Notes — one pass

- **Decisions, insights, references** worth keeping → the memory file that owns them (table below).
- **Decisions with no durable home yet** → name the command that gives it one: `/to-spec` or `/to-tickets` for a spec or tickets, `/edit-governance` for an ADR or rule. It gets its own status line.
- **Context the next thread needs** (findings, a half-done approach, why a step is blocked) → a comment on the stream's issue (`gh issue comment <n>`), never a `/tmp` or scratch handoff file.

Skip ephemeral debugging steps, retracted ideas, and anything obvious from the diff. Nothing worth keeping is a valid result: say "no notes".

| Content | Destination (`~/.claude/memory/`) |
|---|---|
| Cross-project conventions, preferences, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |
| Project-specific learnings | the project's own repo docs (see `projects.md`) |

A new file under `tools/` or `domain/` opens with `type:`, `title:` and a one-sentence `description:` frontmatter; then run `python3 -I .githooks/memory-bundle.py` in `~/.claude-vault` to regenerate the indexes.

### 4. Name and settle the thread

Through the T3 MCP (load each with ToolSearch first):

- `t3_thread_update` with `action: "rename"` and `title: "<project>-<ticket-or-pr>-<topic>"` (kebab-case, no date, no status words), so the thread is findable.
- `t3_thread_organize` with `action: "settle"` when the status block is `Done.`; it applies at turn end. Leave it active when anything is `Waiting on you:`.

Not running in T3 (the tools don't load) → print the `/rename` command instead and skip settling.

### 5. The status block

Run any full-close extras that apply (below) before this step, so their outcome shapes the block.

List every item this thread leaves unfinished: uncommitted or unpushed work, an open PR, an unanswered question, an issue drafted but not filed, a follow-up promised. Check each against git, the PR host and the tracker, not memory.

One line per item, each naming its branch, PR, issue or file: `Parked: <action>` for work a thread can do, `Waiting on you: <ask>` when Drew must act first. The item that comes first goes on the last line, and when other items sit above it the last line ends `(+<N> more above)`. Nothing left → `Done.`.

A `Parked:` line is what Drew pastes into a new T3 thread, so it names the thread to open and its first prompt:

| Next step | Status line |
|---|---|
| Start a tracker issue | `Parked: new T3 thread, worktree <branch>: /implement GH-<n>` |
| Continue this thread's half-done work | `Parked: reopen <this thread's link>: <next action>` |
| A slice with no issue yet | `Parked: /to-tickets GH-<parent>`, then `/implement` per ticket |
| Ship | `Parked: /pr, then wt step ship` |

Launch a `Parked:` thread with `t3_thread_launch` only when Drew says to.

## Full close — only when triggered

| Trigger | Extra |
|---|---|
| `.claude/tasks/*.md` or design docs belong to work closed this thread | Plan sweep |
| The thread made things outside this repo: remote branches, other repos, containers, processes, scratch dirs, comments | Leftovers inventory |

### Plan sweep

For each plan or design doc of work closed here: fold durable outcomes into CHANGELOG/ADR first, then propose deletion and confirm per file. Plans for open work stay.

### Leftovers inventory

List everything this thread created outside the commits. Check each **live** (remote, tracker, filesystem, `docker ps`) and sort it: **Landed**, **In flight** (name who it waits on), **Debris** (clean up without asking: a scratch branch this thread pushed, a temp file, an idle process or container), **Out of scope** (draft an issue title and body; file on confirm). Anything another agent made stays put and is named in the report.

## Report

```
<N> mistakes logged · <N> memory updates · <N> commits · <N> leftovers cleaned
```

Drop any segment whose step didn't run. Then the status block: the reply's last line is a status line.

## Self-check before reporting done

- Every correction Drew made this thread has a MISTAKES.md entry or a **Recurred** line in the main checkout's log.
- Counter reflects actual counts.
- The thread is renamed, and settled only when the block is `Done.`.
- The reply ends on the status block, the first item last.
