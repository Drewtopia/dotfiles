# Testing Patterns

**Analysis Date:** 2026-04-29

## Test Status

**Current State:** No formal test suite present in repository.

- No test runner configured (`bats`, `shellspec`, `pester` not present)
- No test files (`*.test.*`, `*.spec.*`, or a `tests/` directory)
- No assertion libraries integrated
- No coverage tooling configured
- No CI pipeline running tests on commit/PR

This repo treats test-quality as a **deferred concern**. Correctness has been maintained through defensive coding patterns (guard clauses, idempotency checks, manual verification) rather than automated tests.

## Planned Testing

According to `C:\Users\AndrewCl\.claude\plans\so-this-is-a-parallel-fairy.md` (Section 4D), the in-flight refactor introduces minimal-viable tests:

**Planned files:**
- `tests/test-aliases.sh` — render aggregated alias bundles via `chezmoi execute-template`, extract alias names, fail on duplicate names. Catches the silent-overwrite gotcha inherent to the planned aggregation pattern.
- `tests/test-shell-syntax.sh` — `zsh -n` on rendered zsh bundles; `pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw <path>))"` on rendered pwsh bundles. Catches gross syntax errors before `chezmoi apply`.

Both planned to be runnable manually; not yet wired into a CI pipeline.

A larger framework (`tests/{unit,integration,regression,performance}/` à la sebastienrousseau/dotfiles) is **deliberately deferred** — adopt only if minimal tests catch a real bug.

## Manual Testing Approach (Current Practice)

Effective verification today relies on chezmoi's own dry-run + diff machinery and shell-level checks:

**Chezmoi pre-flight:**
- `chezmoi diff` — inspect what would change before applying
- `chezmoi apply --dry-run` — execute the apply pipeline without writing files
- `chezmoi execute-template < some.tmpl` — render a single template against current data

**Post-apply spot checks:**
- Open a fresh shell, verify env vars / aliases / functions are present
- `command -v <tool>` for tools expected to be installed
- `mise --version`, `atuin --version`, etc., for runtime checks

**State-validation hooks** (defensive testing built into the codebase, not a test suite):
- `home/dot_claude/hooks/executable_session-start-git-status.sh` — branch age, commit count ahead, dirty state, stale worktrees, upstream sync
- `home/dot_claude/hooks/executable_jj-block-trunk.sh` — prevents jj edits to `trunk`/`develop` branches

## Defensive Patterns (Used Instead of Formal Tests)

The codebase substitutes defensive coding for automated tests:

**Guard clauses on tool availability:**
```bash
if command -v mise >/dev/null 2>&1; then
    eval "$(mise activate zsh)"
fi
```
*Location: `home/dot_config/shell/010-mise.sh.tmpl`*

**Idempotency checks on stateful operations:**
```bash
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    # only backup if the file exists and is not already a symlink
    ...
fi
```
*Location: `home/.chezmoiscripts/common/run_before_03-backup-claude-memory.sh`*

**Hash-triggered re-runs** (`run_onchange_*`):
- Scripts re-execute only when their rendered content hash changes
- Effectively "test-like" because hash inputs are explicit (e.g., `# packages-hash: {{ .brew | toJson | sha256sum }}` in the planned packages refactor)

**Tight error control:**
- `set -uo pipefail` (or `set -eufo pipefail`) headers ensure failures halt execution rather than silently corrupting state.

## Test Organization (When Implemented)

**Location:** `tests/` directory at repo root (planned).
**Naming:** `test-{feature}.sh` — describe what the file validates.
**Language:** plain bash + chezmoi CLI (`chezmoi execute-template`) for now. No framework dependency.

Adoption order suggested by the refactor plan:
1. `tests/test-shell-syntax.sh` first (cheapest, catches the most common breakage)
2. `tests/test-aliases.sh` second (motivated by aggregation's silent-collision gotcha)
3. Anything beyond — only when a regression occurs that the existing two would have caught.

## Coverage

**Not measured.** Implicit coverage is provided by:
- Chezmoi `run_onchange_*` lifecycle scripts re-running on every relevant change
- Hooks (`SessionStart`, `PreToolUse`, etc.) running every relevant invocation
- Shell fragments sourcing on every interactive shell launch
- Manual verification in daily use

**Untested by definition:**
- Platform-specific code paths only run on the relevant platform — Windows-only PowerShell functions can't be exercised on macOS
- WSL2-conditional paths only run inside WSL2
- 1Password failure modes (`op signin` not active, vault unavailable, etc.) — no fallback, no test
- The planned interop layer (`cb`, `open`, `notify`, `reload`) — by design, only correct on the matching platform

## What to Test (When Adding the Suite)

**Highest-value, lowest-cost (Tier 1):**
- Shell syntax of rendered bundles (`zsh -n`, pwsh `[scriptblock]::Create()`)
- Alias-name uniqueness across rendered aliases bundle (planned aggregation pattern)
- Chezmoi template rendering doesn't error (`chezmoi apply --dry-run` exits 0)

**Medium-value (Tier 2):**
- Critical aliases exist after apply (`alias ls`, `alias cat` resolve)
- PATH wiring works (mise shims on PATH, no duplicates)
- Hook scripts exit 0 in normal conditions

**Higher cost / lower priority (Tier 3 — defer until pain):**
- Cross-platform integration tests (would need Docker/VMs for Linux/Windows/macOS coverage)
- 1Password integration tests (would need a sandbox vault)
- Performance regressions (shell startup time, render time)

## Anti-Patterns Observed

- **No CI pipeline.** Cross-platform breakage is only caught when applying on the affected platform.
- **No regression suite.** Adding a tool integration doesn't run anything; breakage in existing functionality is found ad-hoc.
- **Manual platform testing.** Each platform is its own island; behavior on macOS doesn't tell you anything about Windows.
- **No test-execution documentation.** Even when planned tests land, there's no current README section explaining how to run them.

## Improvement Recommendations

1. **Land `tests/test-shell-syntax.sh` first.** Cheapest, broadest coverage, catches the most common class of regression.
2. **Wire it into `pre-commit`** (or at least `Makefile`/`mise tasks`) so it runs without thinking.
3. **Document execution in repo `README.md`** when introducing the first test.
4. **Consider GitHub Actions cross-platform smoke later** — but only if the tests are proven valuable on the local-dev side first.
5. **Stay disciplined about test bloat.** Sebastien's `tests/{unit,integration,regression,performance}/` framework is impressive but heavier than this repo needs. Two lean tests > eight padded ones.

---

*Testing analysis: 2026-04-29*
