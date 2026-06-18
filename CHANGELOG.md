# drewtopia-dotfiles

## 0.0.1

### Patch Changes

- [#21](https://github.com/Drewtopia/dotfiles/pull/21) [`658801d`](https://github.com/Drewtopia/dotfiles/commit/658801d683d206616f915fdf197f0630d95d7c42) Thanks [@Drewtopia](https://github.com/Drewtopia)! - Reconcile mattpocock/skills to upstream v1.0.0 and adopt changesets.

  - Skills: replace `write-a-skill` → `writing-great-skills`, rename `diagnose` → `diagnosing-bugs`, drop `zoom-out`; add `codebase-design`, `domain-modeling`, `resolving-merge-conflicts`, `ask-matt`, `grilling`. Stale `~/.claude/skills` symlinks purged via `.chezmoiremove.tmpl`.
  - Tooling: adopt `@changesets/cli` for a versioned `CHANGELOG.md` (local-only, nothing published).
