---
description: Review open PRs on the current repo that have changed since the last pass, and report findings locally
---

Review the open pull requests on the current repository and report what needs attention. Do not post anything to GitHub — findings go to this session only.

## State

Track what has already been reviewed in `~/.local/state/claude/pr-review-watch.json`, a map of `"<owner>/<repo>#<number>"` to `{"sha": "<head SHA>", "draft": <bool>}` — the head SHA reviewed last and whether the PR was a draft at the time. Create the file and its directory if missing. A bare string value is the legacy shape and means the draft state is unknown; treat such a PR as changed and rewrite its entry in the current shape.

## Steps

1. `gh pr list --json number,title,headRefOid,isDraft,url,updatedAt` for the current repo.
2. Skip a PR only when its `headRefOid` matches the recorded `sha` **and** its `isDraft` matches the recorded `draft`. A draft marked ready keeps its SHA but changes what the triage rules allow: it was reviewed under the never-notify clause, so findings that should interrupt were suppressed. Re-review it once so those findings can surface. A ready PR returned to draft is likewise a change of reporting state, so re-review it too — reviewing twice is cheaper than a suppressed finding.
3. First pass — for each remaining PR run `/code-review <number> low`. Low effort keeps a sweep cheap and yields few, high-confidence findings; it is the filter, not the verdict.
4. Escalation pass — for a PR whose first pass produced a finding, point the one matching specialist at that PR alone. Escalate at most three PRs per sweep, the most severe first, so a bad sweep cannot run away with tokens.

   | First-pass finding | Specialist |
   |---|---|
   | Swallowed error, empty catch, silent fallback | `pr-review-toolkit:silent-failure-hunter` |
   | Logic changed with no matching test, or tests altered | `pr-review-toolkit:pr-test-analyzer` |
   | New or rewritten comment, docstring, or doc block | `pr-review-toolkit:comment-analyzer` |
   | New type, interface, or schema | `pr-review-toolkit:type-design-analyzer` |
   | Anything else | `pr-review-toolkit:code-reviewer` |

   Do not run `code-simplifier` — it polishes rather than reviews, and the triage rules drop what it reports.
5. Record each reviewed PR's `headRefOid` and `isDraft` in the state file, whether or not findings were produced, and drop entries for PRs no longer in the open list so the file does not grow without bound.
6. Report per the triage rules below. Attribute each finding to the pass that produced it.

## Triage rules

**Notify immediately.** A finding in any of these categories interrupts, because each is cheap to fix while the PR is open and expensive once merged:

- A secret, credential, token, or dotenv file present in the diff.
- A test weakened, skipped, or deleted to make a check pass.
- An *undeclared* governance-surface edit — `.github/workflows/`, `docs/adr/`, any `SKILL.md`, `.claude/rules/`, `.claude/hooks/`, `.claude/settings*.json`, `CLAUDE.md`, `AGENTS.md`, or their `dot_claude/` sources — where the PR title and body do not say that surface is being changed. This repository's whole purpose is agent configuration, so a hook or skill PR touching hooks or skills is expected and is not a finding. The signal is a governance file changed as a side effect of a PR that claims to be about something else.
- Work-machine or private-repo detail in the diff or the PR body — internal hostnames, employer repo or branch names, ticket IDs, work usernames, absolute paths containing any of them. This repository is public.
- A deletion wider than the PR title and body describe.

**Quiet summary.** Report in the printed digest, no notification:

- Correctness bugs, including template logic that breaks on an unset variable.
- Cross-platform breakage — a change valid on macOS that fails on Windows or WSL, or the reverse.
- Shell quoting and word-splitting defects.
- Documentation that contradicts the behaviour in the same diff.
- A PR that no longer merges cleanly, or whose content is already on `main` while the PR stays open. Check `mergeable` and `mergeStateStatus` from `gh pr view`.

**Drop silently.** Never report:

- Formatting and style preferences that do not change behaviour.
- Approval, praise, or a summary of what the PR does correctly.
- Anything already reported for the same head SHA.
- Suggested refactors outside the diff's scope.

## Reporting

Send a `PushNotification` only when the triage rules above say a finding warrants interrupting. Otherwise print a one-line summary per reviewed PR and stop.

Draft PRs are reviewed but never trigger a notification.
