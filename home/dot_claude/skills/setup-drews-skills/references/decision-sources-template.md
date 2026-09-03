# decision-sources.md — structure

The file `setup-why` writes. One template, filled from what exploration actually found —
not three host-specific variants, because the sections are the same everywhere and only
the commands differ.

Two rules bind every section:

1. **Never restate another doc.** If `docs/agents/issue-tracker.md` owns the tracker,
   reference it and move on. Duplicated operational detail drifts, and the copy that drifts
   is always this one.
2. **Only write what was verified this run.** A command nobody ran, a trap nobody
   confirmed, an area path taken from memory — leave it out. A short true file beats a
   long plausible one.

---

## Template

````markdown
# Decision sources

Where the *reasons* behind this repo's code are recorded. Read by the `why` skill; useful
to anyone asking "why is this like this" before changing it.

<!-- List the docs that own detail this file must NOT repeat. Omit the line if none. -->
Operational detail is not repeated here. `<doc>` owns `<what>`; `<doc>` owns `<what>`.
This file covers only what those do not.

## <PR host> — the review is the evidence

<!-- Commands verified to work on this machine. -->
```bash
<fetch a PR by id>
<search merged PRs by term>
<link a PR to its ticket or work item>
```

**Reviewer comment threads are the richest source and the one most often skipped.** A
rejected approach usually dies in a thread and never reaches the description. Note here
whether the default fetch includes threads, and the command if it does not.

Trunk is `<trunk>`. <State whether merges are squashed, and what that means for reading a
commit message.>

## <Issue tracker>

<!-- If another doc already owns this, replace this whole section with a pointer. -->
<Where issues live, whether that is this repo or another, and any flag or env var every
call needs.>

<What lives in the tracker that lives nowhere else — specs, PRD parents, scope arguments
in comments.>

## <Work-item board> — optional, delete if none

<What it records that the tracker does not: acceptance criteria, delivery stage, sponsor.>

```bash
<read one work item>
<query, showing the scoping the host requires>
```

<Any scoping requirement, with the exact error text when it is unscoped — the error is the
useful fact.>

## Traps

<!-- Only user-confirmed traps. This section is why the file earns its place. -->
- **<Trap>.** <What it looks like, and what to check instead.>

## Decision records

<Paths to ADRs, mistakes log, changelog, environment docs — whatever exploration found.>

A defensive guard — a null check, retry, timeout, rate limit, feature flag, egress guard —
was written *at* something. Search these before concluding it has no recorded cause.
````

---

## Section notes

**PR host.** The single most valuable thing this file can record is how to reach reviewer
threads. A PR body reading "addresses feedback" carries its entire rationale in threads
the default command does not print.

**Traps.** Cannot be probed — they come from the user. The recurring shapes worth
prompting for: a merged PR that does not close its issue (leaving ghost-open tickets); a
parent ticket that stays open by design while children close; a deprecated directory whose
history records superseded decisions; two systems that routinely disagree, where the
disagreement is itself the finding.

**Stages.** Where a project promotes through environments, a board column or label often
*is* the stage. Then "why doesn't this work" is answered by a stage rather than a decision:
the change exists and simply has not been promoted. Record this if it applies; it is the
single most common false "why" in staged environments.
