---
description: Review open PRs on the current repo that have changed since the last pass, and report findings locally
---

Review the open pull requests on the current repository and report what needs attention. Do not post anything to GitHub — findings go to this session only.

## State

Track what has already been reviewed in `~/.local/state/claude/pr-review-watch.json`, a map of `"<owner>/<repo>#<number>"` to the head SHA reviewed last. Create the file and its directory if missing.

## Steps

1. `gh pr list --json number,title,headRefOid,isDraft,url,updatedAt` for the current repo.
2. Skip a PR when its `headRefOid` matches the recorded SHA — it has not moved since the last pass.
3. For each remaining PR, run the review with a `cavecrew-reviewer` subagent, one agent per PR, launched concurrently. Give each agent the PR number and tell it to diff against the merge base.
4. Record each reviewed PR's `headRefOid` in the state file, whether or not findings were produced.
5. Report per the triage rules below.

## Triage rules

**Notify immediately.** A finding in any of these categories interrupts, because each is cheap to fix while the PR is open and expensive once merged:

- A secret, credential, token, or dotenv file present in the diff.
- A test weakened, skipped, or deleted to make a check pass.
- A governance surface edited: `.github/workflows/`, `docs/adr/`, any `SKILL.md`, `.claude/rules/`, `.claude/hooks/`, `.claude/settings*.json`, `CLAUDE.md`, `AGENTS.md`, or their `dot_claude/` sources.
- Work-machine or private-repo detail in the diff or the PR body — internal hostnames, employer repo or branch names, ticket IDs, work usernames, absolute paths containing any of them. This repository is public.
- A deletion wider than the PR title and body describe.

**Quiet summary.** Report in the printed digest, no notification:

- Correctness bugs, including template logic that breaks on an unset variable.
- Cross-platform breakage — a change valid on macOS that fails on Windows or WSL, or the reverse.
- Shell quoting and word-splitting defects.
- Documentation that contradicts the behaviour in the same diff.

**Drop silently.** Never report:

- Formatting and style preferences that do not change behaviour.
- Approval, praise, or a summary of what the PR does correctly.
- Anything already reported for the same head SHA.
- Suggested refactors outside the diff's scope.

## Reporting

Send a `PushNotification` only when the triage rules above say a finding warrants interrupting. Otherwise print a one-line summary per reviewed PR and stop.

Draft PRs are reviewed but never trigger a notification.
