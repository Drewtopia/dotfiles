# MISTAKES.md

Newest first. Append-only facts: what happened, root cause, consequence, prevention.

## 2026-09-03 accepted a commit message's claim as verified fact and abandoned correct work

**What happened:** Commit `737a81e` swapped the zod skill source, stating pproenca/dot-skills "never carried a zod skill — only .curated, .experimental, .template". I called that rationale "better than mine", abandoned my own branch as redundant, and repeated the claim to two peer sessions. The claim is false: `skills/.curated/zod/SKILL.md` exists, `skills use pproenca/dot-skills@zod` resolves, and the payload installed at ~/.agents/skills/zod came from there.

**Root cause:** Treated a commit message as a canonical source. It is a derived artifact — a claim about the world, not the world. I had verified the swap's destination resolved but never the source, then adopted someone else's assertion about the source without the check I had already skipped once myself.

**Consequence:** A false claim reached main in both a commit message and a live comment, and I amplified it to two other sessions. No functional breakage — both repos ship a working zod skill. Corrected in PR #103.

**Prevention:** verify-dont-trust applies to commit messages, PR bodies and peer messages, not just files and URLs. When a claim is the reason to stop doing work, check it before stopping — abandoning work on an unverified premise costs the same as acting on one. Same session, three sessions made this error: two asserted "verified just now" about refs they had failed to fetch.

## 2026-08-31 "fixed" merged-prs.sh parsing on an assumed convention, would have dropped real links

- **What happened:** Reviewing PR #97, I flagged that `merged-prs.sh` parsed the linked issue id from `sourceRefName + title` and could mint false links from stray title numbers. Drew said "fix the false-positive parsing," so I changed it to parse the branch only, tested against invented sample branches, and pushed. It was wrong: in the repo where the skill is predominantly used, the issue id lives in the PR title as an explicit `GH-<n>` while branches are plain conventional-commit, so branch-only parsing dropped 15 real links to kill 1 phantom.
- **Root cause:** I designed the fix against an assumed data shape (id-in-branch) and validated it only with synthetic examples that encoded that same assumption. I never checked the real distribution before shipping — the actual convention was the opposite. Caught only because the change was validated against live `az repos pr list` data on the work box afterward.
- **Consequence:** A wrong fix pushed to the open PR branch. Superseded by a follow-up commit (explicit gh/issue token still scans branch+title; only the bare 5-digit ADO fallback restricted to the branch), which keeps all 15 real links and kills the 1 phantom. Two commits where one partly undoes the other, because the first was pushed before validation.
- **Prevention:** Before "fixing" a parser/heuristic, sample the REAL data it runs against — especially for a shared helper whose predominant use is a repo you're not currently in. Synthetic tests that encode your own assumption confirm the assumption, not the fix. Validate against production data BEFORE pushing, not after.

## 2026-08-27 measured tool resolution under -NoProfile, concluded the wrong thing

- **What happened:** Investigating slow pwsh startup on the work box, I checked how CLI tools (bat/rg/fd/jq/…) resolve and measured their per-invocation cost with `pwsh -NoProfile`. Every tool resolved to a mise shim and `bat --version` took 569–1085ms (8.6s cold), so I told Drew the tools were "emphatically much slower via mise" and implied moving them off mise would speed up every command.
- **Root cause:** `-NoProfile` skips `mise activate`, so hook-env never runs and never prepends the tool install dirs to PATH. What I measured was the non-activated fallback (shims win, each re-execs mise), not the interactive reality. Re-measuring with the profile loaded, the same tools resolve to the direct install binary and `bat --version` is 90–186ms — the shim penalty does not apply in a normal activated shell.
- **Consequence:** A confident, wrong conclusion that could have driven a pointless migration of ~20 tools off mise (reversing the deliberate "single source of truth" design) for zero interactive benefit. Caught only because Drew pointed at git history, where `c54a257` already fixed the shim-re-exec cost for zoxide and `ed40a24` documents why shims stay on PATH.
- **Prevention:** Measure startup/resolution in the SAME context the user actually runs — a profile-loaded (activated) shell — never `-NoProfile`, which changes PATH resolution. `-NoProfile` is for isolating the profile's own cost, not for measuring anything that depends on what the profile sets up. Check git history for prior attempts before concluding a subsystem is misconfigured.

## 2026-08-27 removed a "duplicate" oh-my-posh init that was actually resilience

- **What happened:** Diagnosing slow pwsh startup on the work Windows box, I found `oh-my-posh init` ran twice — once in the hand-written OneDrive `$PROFILE` bootstrap, again in the chezmoi-managed dev-tools profile it dot-sources. I removed the OneDrive one as pure duplication (~680ms saving). The prompt then intermittently fell back to the default `PS C:\>` when several terminal tabs were opened at once.
- **Root cause:** `oh-my-posh init pwsh` spawns `oh-my-posh.exe`. Under concurrent shell startup with unmitigated Defender scan-on-execute (exclusions are Tamper-Protection/policy-locked, can't be added locally), the cold spawn intermittently returns empty; `| Invoke-Expression` of nothing sets no prompt. The two init calls were not redundant — the second was a retry that masked the flaky first spawn. Removing it left a single point of failure.
- **Consequence:** Intermittent bare prompt, worsening as more tabs opened. Reverted by restoring the OneDrive profile from its `.bak.pre-omp-dedup` backup. Net startup win for the session dropped from the claimed ~680ms back to 0.
- **Prevention:** A "duplicate" call to a flaky external binary can be deliberate resilience. Before deleting apparent redundancy, ask what failure it might be masking — especially when the root cause (here, AV cold-spawn tax) is known and unfixable. If dedup is still wanted, replace the redundancy with an explicit retry-on-empty in one place, don't just delete one copy.

## 2026-08-27 apostrophe in a jq comment broke the settings modify script

- **What happened:** Adding an `autoMemoryEnabled` pin to `home/dot_claude/modify_settings.json.tmpl`, the explanatory comment used the word `can't`. The rendered modify script then failed at runtime with `line 366: syntax error near unexpected token '('` and `chezmoi cat` emitted 0 bytes.
- **Root cause:** The jq program is passed to `jq` inside a single-quoted bash string (`jq '…'`). jq comments live inside that string, so the apostrophe in `can't` closed the bash single-quote early; the following `(runtime wins)` was then parsed as bash, not jq.
- **Consequence:** Caught pre-commit. Had it shipped, every `chezmoi apply` would emit empty settings for that file. An early "render OK" false-passed because `jq` on empty stdin exits 0 — byte-count the render, don't trust exit status.
- **Prevention:** No apostrophes (or unescaped single quotes) in comments inside a single-quoted jq program. Verify the modify script by byte-count of `chezmoi cat`, not just jq exit code.

## 2026-08-18 caveman installed via pnpm CLI instead of marketplace plugin

- **What happened:** On a dev machine, caveman was installed with `pnpm install -g @caveman-ai/cli && caveman setup --install`. Later, Claude Code failed every request with `API Error: Connection refused (ConnectionRefused)`.
- **Root cause:** `caveman setup --install` writes `ANTHROPIC_BASE_URL=http://127.0.0.1:8787/...` into `~/.claude/settings.json` and adds hooks that route through a local `caveman-proxy` on port 8787. The proxy is spawned on demand with no supervisor, so when it is down every request hits a dead loopback port and is refused. Direct egress to `api.anthropic.com` was fine throughout — the failure was the self-inflicted proxy dependency, not the network.
- **Consequence:** Claude Code unusable until the base URL and proxy hooks were removed. Removing them from `settings.json` alone was insufficient: the already-running Claude Code daemon and its child sessions had the stale `ANTHROPIC_BASE_URL` baked into their environment at launch, so a full daemon restart (not just quitting the TUI) was required.
- **Prevention:** Install caveman as the marketplace plugin only. The chezmoi source already does this via `[marketplaces]` + `enabledPlugins` in `home/.chezmoidata/claude.toml`; the marketplace plugin ships skills and agents with no auto-firing hooks and never sets a base URL. Do not run the pnpm CLI path, and do not invoke the plugin's own `caveman-setup` skill — that skill re-injects the same proxy and base URL. If a base-URL redirect ever needs to be undone, also restart the Claude Code daemon so live processes drop the stale environment variable.
