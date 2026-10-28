---
name: close
description: Close out this session, never its stream, so the next one starts in the right place — commit, notes, and a closing status block, one line per unfinished item, kept in the transcript; full extras only when plan docs or out-of-repo leftovers call for them. Use for /close, "close the session", "wrap up", "end session"; `/close full` runs every extra.
disable-model-invocation: true
---

# /close — session closeout

Quick close runs every time and stays short: a heavy closeout is a closeout that gets skipped. Full extras run only when their trigger is present, or when invoked as `/close full`.

`/close` ends this session only; other sessions in the same worktree carry on. The stream ends when its PR merges and Land runs: `closeout-tab` runs it after closing the stream's last tab, or Drew presses **Land** on the `merge-watch` band. In a repo whose worktrunk config defines the `land` alias, that runs `wt step land`, which refuses while a Claude session runs in the worktree, closes the `gh<n>` issue, marks the Orca card completed and removes the worktree; elsewhere it is `wt remove <branch>`. Either way `/close` never removes a worktree or closes a stream's issue, and a merged worktree waiting for Land is not an open item: with nothing else left, the block is `Done.`; an issue whose branch carries no `gh<n>` is closed by `/reconcile-tracker`.

Where things live after a close:

- **Everything this session leaves unfinished** → the closing status block (step 3), one line per item. The block in the session's transcript is the record. The `open-loops` mod, when it saves for the session, also copies the last line to the worktree's Orca card and lists it at every new session start; that copy is a convenience, not the record.
- **What happened** → the remember plugin's own history and the session's transcript, both written automatically.

Global memory (`~/.claude/memory/`) lives in the vault, whose `main` is protected: edit it on a vault work branch and land it as `edit-governance` step 3 says (`git -C ~/.claude-vault fetch . <branch>:main`, then Drew pushes) so entries reach the other machines. The git work in step 1 is for the **outer project repo** (e.g. chezmoi, an app repo) — not the vault.

## Quick close — every time

### 1. Commit

```bash
git rev-parse --show-toplevel 2>/dev/null
git status --short
git diff --stat HEAD
```

Not inside a git repo → skip to step 2. Clean tree → say so in one line and move on.

Dirty tree → read the full diff (`git diff HEAD`): hunks, not filenames.

- On `main`, `master`, or `develop`, the work belongs on its stream's branch — the `gate-commit-not-protected` hook hard-blocks commits there. Find the stream with `wt list`, or name a new `<type>/<topic>` branch. Carry the changes over with `git stash push -u -m <branch>`, then `wt switch --create <branch> --no-cd` and `orca agent launch --agent claude --worktree branch:<branch>`; never switch this checkout's branch. That stream's tab pops the stash and commits: tell Drew which tab (card and tab title) and that it runs `git stash pop` first, then skip to step 2 here.
- Group hunks by **purpose**, not by file. A single file can span two commits; two files can belong to one. One logical change → one commit; don't manufacture splits.
- For each group: state the paths/hunks and the commit message (English imperative, conventional-commit prefix when it fits), confirm with Drew, stage only those paths (`git add -p` when hunks in one file split), commit.
- Do **not** push. Do **not** use `git add -A`.

### 2. Notes — one pass

Read back through the session once for what future work needs:

- **Mistakes** — breakages or corrections not yet in the main checkout's `MISTAKES.md` → append them (what happened / root cause / consequence / prevention, newest first). Never a worktree's copy: it is gitignored and dies with the worktree. Target `"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/MISTAKES.md"`.
- **Decisions, insights, references** worth keeping → the memory file that owns them (table below).
- **Decisions with no durable home yet** — a scope call, a design choice, a deferred question → name the command that gives it one: `/to-spec` or `/re-spec` for a spec, `/to-tickets` or `/re-ticket` for tickets, `/edit-governance` for an ADR or rule. It gets its own line in the status block (step 3).
- **Open tasks** → a line each in the status block (step 3), or a tracker issue, not memory.
- **Follow-ups** — a finding outside this session's task, or a task it will not finish → file it now under the repo's filing rules. Check for a duplicate first: search open and closed issues for the finding's key terms (file name, error text, ticket number), e.g. `gh issue list --state all --search "<terms>"`. A match gets a comment with the new evidence (a closed match is reopened when the finding shows it is back); only no match opens a new issue. A product bug for a person to file (an Azure bug) stays a draft. Never leave Drew to pick which to file; a `Waiting on you:` line is only for an ask no agent can do.
- **Context the next session needs** (findings, a half-done approach, why a step is blocked) → a comment on the stream's issue (`gh issue comment <n>`, plus `--repo` when the tracker is its own repo), never a `/tmp` or scratch handoff file. `/handoff` is only for a new directory, a new harness or a colleague.

Skip ephemeral debugging steps, retracted ideas, and anything obvious from the diff. Nothing worth keeping is a valid result: say "no notes".

| Content | Destination (`~/.claude/memory/`; auto-memory keeps its own notes under `~/.claude/projects/`, and `/close` does not write there) |
|---|---|
| Cross-project conventions, preferences, naming, workflow style | `general.md` (append) |
| Tool configs, CLI patterns, workarounds for a specific tool | `tools/{tool}.md` (one file per tool) |
| Domain knowledge for a product, area, or codebase | `domain/{topic}.md` |
| Project-specific learnings | the project's own repo docs (see `projects.md`) |

A new file under `tools/` or `domain/` opens with `type:` (`Tool` or `Domain`), `title:` and a one-sentence `description:` frontmatter. Then run `python3 -I .githooks/memory-bundle.py` in the vault repo (`~/.claude-vault`) to regenerate the indexes; its pre-commit hook refuses a missing field or a stale index. Agents find a topic with `rg -il <term> ~/.claude/memory`. Live work state belongs in the project's own tracker (for this repo: GitHub issues).

### 3. The status block

Run any full-close extras that apply (below) before this step, so their outcome shapes the block.

List every item this session leaves unfinished, not only the next one: uncommitted or unpushed work, an open PR, a question or approval still unanswered, a bug or issue drafted but not filed, a run queued or not yet read, a follow-up promised in the session. Check each against git, the PR host and the tracker, not memory.

The report (below) ends on that list, one line per item, each naming its branch, PR, issue or file: `Parked: <action>` for work a session can do, `Waiting on you: <ask>` when Drew must act first. The item that comes first goes on the last line, and when other items sit above it the last line ends `(+<N> more above)`, so a reader of that line alone knows the list is longer. Nothing left → the block is one line, `Done.`. A `Parked:` line is one line Drew pastes into a fresh session, so it opens with a runnable command:

| Next step | Status line |
|---|---|
| Start a tracker issue | `Parked: wt switch --create <the branch the focus working document names, else the ticket's area stream> --no-cd, then orca agent launch --agent claude --worktree branch:<branch>, then /implement GH-<n>` |
| Continue a tracker issue this session left half-done | `Parked: orca agent launch --agent claude --worktree branch:<branch>` |
| A spec with two or more `ready-for-agent` tickets | `Parked: /implement-spec GH-<spec>` |
| A slice with no issue yet ("PR 4", "the follow-up") | `Parked: /to-tickets GH-<parent>`, then `/implement` per ticket |
| Ship | `Parked: /pr, then PR_BODY=<file> wt step ship` |

Then retire the remember plugin's handoff slot. Its session-start hook re-delivers a non-empty slot to every session until it is replaced, and the status block now holds the open items:

```bash
slot="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.remember/remember.md"
[ -s "$slot" ] && cat "$slot" >> "${slot%.md}.retired.md" && : > "$slot"
```

## Full close — only when triggered

Run each extra whose trigger is present. `/close full` runs all of them.

| Trigger | Extra |
|---|---|
| `.claude/tasks/*.md` or design docs belong to work closed this session | Plan sweep |
| The session made things outside this repo — remote branches, other repos, containers, processes, scratch dirs, comments, files | Leftovers inventory |

### Plan sweep

Implementation plans and completed design docs do not survive task closure. List `.claude/tasks/*.md` and any design docs belonging to work closed this session. For each: fold durable outcomes into CHANGELOG/ADR/execution summary first, then propose deletion and confirm per file. Plans for still-open work stay untouched.

### Leftovers inventory

List everything this session created, changed, or started outside the commits — remote scratch branches, PRs, issues, comments it wrote, files outside the repo, scratch dirs, processes, containers. Worktrees and their branches are not on this list: `wt step land` ends them. Check each one **live** (remote, tracker, filesystem, `docker ps`), never from memory, and sort it:

- **Landed** — merged, closed, released, verified on the remote.
- **In flight** — waiting on review, CI, a pipeline, or a person; name who or what.
- **Debris** — a remote scratch branch this session pushed, a temp file, an idle process or container, a stale comment this session wrote.
- **Out of scope** — a finding that deserves its own tracker issue. File it now, while the context is live, as step 2's **Follow-ups** says.

Clean up **Debris** without asking, since the live check already showed it finished or idle: `git push origin --delete <branch>` for a scratch branch, and stop or delete the process, container or temp file. A stale comment is proposed in the report, not deleted. Anything another agent made stays put and is named in the report; a step a hook blocks goes in the report as one `!` command for Drew.

Report the sorted list: what was cleaned, what is in flight and who it waits on, and the issues filed or commented on.

## Report

Print the counter:

```
<N> memory updates · <N> commits · <N> issues filed · <N> leftovers cleaned
```

Drop any segment whose step didn't run rather than printing `0`. Then a `/rename <project>-<ticket-or-pr>-<topic>` command Drew can paste (kebab-case, no date, no status words) so `/resume` and `/find-session` can find the session, and last the status block from step 3: the reply's last line must be a status line, because tools that read the transcript (and `open-loops`, when it saves) look there.

## Self-check before reporting done

- Every new memory file opens with `type:`, `title:` and `description:` frontmatter, and the vault's indexes were regenerated.
- Counter line reflects actual counts, not aspirational ones.
- The reply ends on the status block: one line per unfinished item, the first item last with `(+<N> more above)` when others sit above it, and every `Parked:` line opens with a runnable command.
- No follow-up is left for Drew to pick: each is filed, or is a `Waiting on you:` ask only a person can do.
- No `/tmp` or scratch handoff file was written for this repo; the remember slot is empty.
- If the session touched vault or chezmoi source: both repos clean and pushed.
