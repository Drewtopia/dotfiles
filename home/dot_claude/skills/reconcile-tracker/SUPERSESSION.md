# Supersession job

Read-only detection; flag-for-triage action. Find open tickets made obsolete by a later decision
(e.g. the CLI->web-app pivot). Housekeeping **flags** high-confidence hits into the triage queue and
closes nothing — `/triage` (mattpocock-skills:triage) disposes of them.

## Detect

Fetch **all** open issues first — pin the limit, the default caps near 30 and truncates silently:
`gh issue list ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} --state open --limit 1000 --json number,title,labels,createdAt`.
Confirm the count matches the burn-down's open total before scanning; a short read misses candidates.

Two ingredients, combined:

1. **Seeded map** — `.claude/housekeeping/supersession-map.md`, maintained by the user. Each entry
   names a superseding thing and the keywords/domain of the tickets it obsoletes. High confidence:
   the user asserted the decision.
2. **Inference** — cluster open tickets against recent ADRs and decisions; flag tickets a decision
   appears to obsolete that the map does not yet cover. Lower confidence.

Each candidate carries: `old GH-N`, the superseding ref (ticket / ADR / decision), a one-line
rationale, and a confidence (map = high, inference = lower).

## Flag for triage (only under `--apply`)

Housekeeping does **not** close superseded tickets — it flags them into the triage queue, and
`/triage` disposes of them. Flagging is reversible and closes nothing, so it needs no per-candidate
approval; the real decision moves to the triage pass.

Flag only the **high-confidence** candidates (seed-map hits). Leave **low-confidence** (inference)
ones in the report as "review manually" — never auto-label a soft guess.

Ensure the provenance label exists once (idempotent):
`gh label create housekeeping ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} --color BFD4F2 --description "Flagged by a housekeeping sweep" --force`.

For each high-confidence candidate, on the old ticket:

```sh
gh issue comment <old> ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} --body \
  "> *AI-flagged by housekeeping.*

Flagged superseded by GH-<new> — <reason>."
# MOVE the state to needs-triage: drop any conflicting state role, then set needs-triage + housekeeping.
gh issue edit <old> ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} \
  --remove-label ready-for-agent,ready-for-human,needs-info,wontfix \
  --add-label needs-triage,housekeeping
```

**Move, don't just add.** A superseded ticket is no longer agent-ready, so it must carry exactly one
state role — `needs-triage` — for `/triage` to act cleanly. Remove the other four state roles first
(`gh` ignores removing a label that isn't present), then add `needs-triage`. Adding `needs-triage`
on top of an existing `ready-for-agent` leaves two state roles, the conflict `/triage` has to stop
and ask about. The `housekeeping` label is a **provenance** marker (not a state) — it groups the
sweep-flagged set so `gh issue list --label housekeeping` finds it regardless of state.

After flagging, print the copy-paste handoff so the set never gets buried:

```
Flagged N for triage: #<a> #<b> #<c> …
→ run:  /triage <a> <b> <c> …
```

Verify each flag by direct `gh issue view <n> --json labels`, **not** `gh issue list --label` — the
label search index lags a few seconds after an edit, so the list under-reports freshly-flagged
issues (a `✓` exit is not proof they show up yet).

Find the set anytime (once the index settles): `gh issue list ${GH_ISSUE_TRACKER_REPO:+--repo "$GH_ISSUE_TRACKER_REPO"} --label housekeeping --state open`,
or tell `/triage` "triage the housekeeping-flagged issues". Triage moves each to `wontfix` /
`ready-for-agent` / etc. and closes as its state machine dictates; on disposition, drop the
`housekeeping` label so the queue drains.
