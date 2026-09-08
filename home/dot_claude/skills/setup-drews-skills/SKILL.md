---
name: setup-drews-skills
description: Configure this repo for the housekeeping, closeout and why skills — split PR host, decision sources, supersession map, trunk override. Extends setup-matt-pocock-skills rather than replacing it; run that one first. Run once per repo.
disable-model-invocation: true
---

# Setup Drew's skills

`setup-matt-pocock-skills` configures the issue tracker, triage labels and domain docs.
Everything downstream of it — `to-spec`, `to-tickets`, `implement`, `review`, `swarm` —
is then already configured, and this skill does not touch any of it.

What it cannot express is a **split host**: code and pull requests on one system, issues on
another. That single fact is what `reconcile-tracker`, `close`, `clean-workspace` and `why`
each need and cannot infer. This skill establishes it, plus the three smaller things that
travel with it.

Prompt-driven, not a script. Explore, present, confirm, then write.

## Prerequisite

If `docs/agents/issue-tracker.md` is absent, stop and tell the user to run
`/setup-matt-pocock-skills` first. Do not write a rival tracker doc — that file is
authoritative and everything here defers to it.

## Process

### 1. Explore

- `git remote -v` — the **code and PR** host.
- `docs/agents/issue-tracker.md` — the **issue** host. Compare the two: if they differ,
  this repo is split-host and Section A matters.
- `git symbolic-ref -q --short refs/remotes/origin/HEAD` — the trunk.
- `.claude/housekeeping/` — does a `supersession-map.md` already exist?
- `docs/agents/decision-sources.md` — has Section B already run?
- `docs/adr/`, `MISTAKES.md`, `CHANGELOG.md`, `docs/reference/` — decision records.
- Host CLIs: `az devops configure -l`, `gh auth status`, `glab auth status` as relevant.
  Probe once and batch — on a bridged or VPN'd machine a burst of CLI calls is itself a
  failure mode.

### 2. Sections

Lead each with the recommended answer. Skip any that exploration already settled.

**Section A — PR host.** The load-bearing one.

`reconcile-tracker` reads `PR_HOST`: GitHub by default, `PR_HOST=azure` when PRs live in
Azure DevOps. It changes how the done set is built — on GitHub from
`closingIssuesReferences`, on Azure by parsing the ticket id out of the source branch.

Propose the value from the `git remote`. Record it in the same gitignored file the tracker
env var already lives in, so both travel together:

```toml
[env]
PR_HOST = "azure"
```

Then state, in `docs/agents/decision-sources.md`, that a merged PR here does **not** close
its issue. That is the consequence users trip over, and it deserves writing down once.

**Section B — Decision sources.** Write `docs/agents/decision-sources.md` per
`references/decision-sources-template.md`. This is what the `why` skill reads to know where
reasoning is recorded: the PR host's review threads, any work-item board and its query
scoping, the decision records found in exploration, and — the section that cannot be probed
— the traps the user confirms.

Ask directly: *what has made a search here silently return nothing, or return something
misleading?* Prompt with the usual shapes: a merged PR that leaves its issue open, a parent
ticket that stays open by design, a deprecated directory whose history is superseded, two
systems that routinely disagree.

**Section C — Supersession map.** `reconcile-tracker` reads
`.claude/housekeeping/supersession-map.md` and **skips supersession silently when it is
absent** — so a missing file is not a no-op, it is an unreported gap that looks like a
clean pass.

Offer to create it with a header and no entries. An empty map still makes the skip
explicit. Skip this section if the repo has no history of superseded work yet.

**Section D — Trunk.** Only ask if `origin/HEAD` did not resolve, or resolved to something
the user does not expect. The shared helpers auto-detect and fall back `develop` → `main` →
`master`; `TRUNK` is an override for when that is wrong, not a value to set routinely.

### 3. Confirm

Show every file you intend to write or edit, in full, and let the user edit before writing.

### 4. Write

Write `docs/agents/decision-sources.md`, and the other artifacts the sections settled.

Add a pointer from the repo's agent-instructions file — `CLAUDE.md` if it exists, else
`AGENTS.md`; ask which to create if neither does, and never create one when the other is
present. Update an existing agent-skills block in place rather than appending a duplicate:

```markdown
### Decision sources

[one line: where reasoning is recorded here]. See `docs/agents/decision-sources.md`.
```

**Governed surfaces.** `AGENTS.md`, `CLAUDE.md` and `.claude/` may sit behind a hook or a
review skill. If an edit is blocked, do not work around it — write what you can, then hand
the user the exact block to add through their governance flow. A blocked edit is the rule
working, not an obstacle.

**Publication check.** `decision-sources.md` names hosts, organisations, projects and
scoping. Before writing, check the repo's visibility
(`gh repo view <owner>/<repo> --json visibility -q .visibility`, or the host equivalent).
If it is public, say so and let the user choose an untracked or private location instead.
Never write organisation detail into a public repo without asking.
