---
name: reconcile-tracker
description: Reconcile a tracker from the merged-work side — walks merged PRs to close the issues behind them, flags superseded tickets for triage, shows burn-down. Use after merges land. For the other direction (sweep every open issue for drift) use realign-tracker.
disable-model-invocation: true
---

# Reconcile tracker

Bring a GitHub issue tracker back in line with reality: close issues whose PR merged, flag tickets
obsoleted by a later decision for triage, and surface the burn-down so intake stays visible. Slower
than clean-workspace — supersession does reading work.

## Config (all optional — GitHub-only is zero-config)

- **Issue host** — issues live in the current repo by default. If they live in a *separate* repo
  (issues split from code), set `GH_ISSUE_TRACKER_REPO`. Every `gh` call then passes
  `${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"}` — the `--repo` flag appears only when
  the var is set. Do not run `eval "$(mise env ...)"`.
- **PR host** — GitHub by default. Set `PR_HOST=azure` when PRs live in Azure DevOps (code repo on
  Azure, issues on GitHub — this repo's shape). Only that changes step 1's PR query.
- **Supersession map** — `.claude/housekeeping/supersession-map.md` if present; skip supersession
  silently when absent (a fresh repo has no pivots yet).

## Done set

`bash ~/.claude/skills/_lib/merged-set.sh` → merged/gone branches + linked `GH-N`. Shared with
clean-workspace, so derive it once when both run in the same pass.

## Steps

1. **Reconcile** — close issues whose PR merged, per
   [`_lib/closing-merged-issues.md`](../_lib/closing-merged-issues.md), handing it the done set
   above. Collect the host's extra link sources first, and union them with the done set:
   - **GitHub** (default): `gh pr list --state merged --json number,headRefName,body,closingIssuesReferences`
     — take `closingIssuesReferences`, plus any `GH-N` / `#N` in the branch name **or body**.
   - **Azure** (`PR_HOST=azure`): the done set is the whole story; `merged-set.sh` already parses
     `GH-N` from the source branch. Reach past locally-pruned branches with `merged-prs.sh`.
2. **Supersession** — detect + flag per [SUPERSESSION.md](SUPERSESSION.md): high-confidence
   (seed-map) hits get `needs-triage` + `housekeeping` labels + an AI-flag comment; low-confidence
   stay report-only. Print the copy-paste `/triage <ids>` handoff. Never closes — `/triage` disposes.
3. **Burn-down** — open total; opened vs closed last 14d; net; the 10 oldest-untouched open tickets
   as a **close-or-kill** list. Surface only. Intake is the real problem — this makes it loud.

The triage-state labels (`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
`wontfix`) and the `housekeeping` provenance label are the mattpocock-skills:triage vocabulary —
the default because `/triage` disposes of the flagged set. Match your repo's labels if they differ.

## Self-check before reporting done

- Every closed issue traces to a confirmed merged PR, and no PRD parent was closed.
- Supersession flagged only seed-map hits; inference candidates stayed report-only.
- Each flagged ticket carries exactly one state role, verified by `gh issue view`, not `gh issue list`.
- The burn-down reports real counts, and the `/triage` handoff line was printed.
