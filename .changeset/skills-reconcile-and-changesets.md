---
"drewtopia-dotfiles": patch
---

Reconcile mattpocock/skills to upstream v1.0.0 and adopt changesets.

- Skills: replace `write-a-skill` → `writing-great-skills`, rename `diagnose` → `diagnosing-bugs`, drop `zoom-out`; add `codebase-design`, `domain-modeling`, `resolving-merge-conflicts`, `ask-matt`, `grilling`. Stale `~/.claude/skills` symlinks purged via `.chezmoiremove.tmpl`.
- Tooling: adopt `@changesets/cli` for a versioned `CHANGELOG.md` (local-only, nothing published).
