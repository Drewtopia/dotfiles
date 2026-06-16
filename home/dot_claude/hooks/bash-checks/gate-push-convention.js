'use strict';
/**
 * PreToolUse(Bash) check: gate `git push` on Conventional Branch naming via
 * commit-check (https://github.com/commit-check/commit-check) — the policy
 * engine, not a homegrown regex. Validates the CURRENT branch name against the
 * Conventional Branch 1.0.0 spec (commit-check's default config).
 *
 * Scope: naming only. Force-push (any branch) and protected-branch pushes are
 * already blocked by block-dangerous-git, which runs earlier in the dispatcher.
 *
 * Availability: commit-check is installed via mise (pipx:commit-check). If it
 * can't be located, this check degrades to "allow" — matching the harness
 * convention in lib/git.js (allow when the tool is absent) rather than blocking
 * every push on a half-provisioned machine. Prevention still comes from the
 * conventional-branch skill; force/protected safety from block-dangerous-git.
 *
 * Note: commit-check --branch validates the CURRENT branch, so an explicit
 * cross-branch refspec (`git push origin other` while on a different branch)
 * is not separately validated — pushes are virtually always the current branch.
 *
 * Policy: commit-check has no global config search path (it looks only in the
 * repo + .github), so a repo-local cchk.toml wins when present, otherwise the
 * gate points commit-check at the global ~/.config/commit-check/cchk.toml via
 * --config. With neither, commit-check's strict defaults apply.
 *
 * run(input, deps?) -> { exitCode: 0 } | { exitCode: 2, stderr }
 *   deps lets tests inject { check, repoRoot, currentBranch } deterministically.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCommand } = require('../lib/hook-io');
const { currentBranch, repoRoot } = require('../lib/git');

const isGitPush = cmd =>
    /(^|[^a-zA-Z])git(\s+-c\s+\S+)*\s+push(\s|$)/.test(cmd);

const REPO_CONFIGS = [
    'cchk.toml',
    'commit-check.toml',
    '.github/cchk.toml',
    '.github/commit-check.toml',
];
const GLOBAL_CONFIG = path.join(os.homedir(), '.config', 'commit-check', 'cchk.toml');

/**
 * Resolve the `--config` flags for commit-check. A repo-local config wins (so a
 * repo / its CI can own its policy); otherwise apply the global config if it
 * exists; otherwise nothing (commit-check defaults). `opts` is injectable for tests.
 */
function configArgs(cwd, opts = {}) {
    const exists = opts.exists || fs.existsSync;
    const global = opts.global || GLOBAL_CONFIG;
    if (REPO_CONFIGS.some(f => exists(path.join(cwd, f)))) return [];
    if (exists(global)) return ['--config', global];
    return [];
}

/**
 * Run `commit-check --branch` in `cwd`, preferring it on PATH and falling back
 * to mise. Returns:
 *   { ok: true }              branch passes
 *   { ok: false, output }     branch fails (commit-check non-zero exit)
 *   { unavailable: true }     commit-check could not be located/run
 */
// Strip mise's own diagnostics so only commit-check's verdict reaches the user.
const stripMiseNoise = s =>
    String(s || '')
        .split('\n')
        .filter(line => !/^mise (WARN|ERROR)/.test(line))
        .join('\n')
        .trim();

function checkBranch(cwd) {
    const flags = ['--branch', '--no-banner', ...configArgs(cwd)];
    const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    // After `chezmoi apply` + `mise install`, commit-check is activated and the
    // bare shim works (fast) — so it is the primary runner. `mise x` resolves
    // the tool even when it is installed-but-not-yet-activated (the bare shim
    // then errors "No version is set"), so it is the fallback for that window.
    const invocations = [
        ['commit-check', flags],
        ['mise', ['x', 'pipx:commit-check@latest', '--', 'commit-check', ...flags]],
    ];

    let unrun = false; // true if no runner ever produced a verdict
    for (let i = 0; i < invocations.length; i++) {
        const [bin, args] = invocations[i];
        const haveFallback = i < invocations.length - 1;
        try {
            execFileSync(bin, args, opts);
            return { ok: true };
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                unrun = true;
                continue; // runner not found — try the next invocation
            }
            const raw = [err.stdout, err.stderr]
                .map(s => String(s || ''))
                .join('\n');
            // A non-activated mise shim fails as a wrapper ("mise ERROR …"),
            // not as a commit-check verdict — fall through to the next runner.
            if (haveFallback && /mise ERROR/.test(raw)) {
                unrun = true;
                continue;
            }
            return { ok: false, output: stripMiseNoise(raw) };
        }
    }
    return { unavailable: unrun };
}

function run(input, deps = {}) {
    const check = deps.check || checkBranch;
    const getRepoRoot = deps.repoRoot || repoRoot;
    const getBranch = deps.currentBranch || currentBranch;

    const cmd = getCommand(input);
    if (!cmd || !isGitPush(cmd)) return { exitCode: 0 };

    const worktree = getRepoRoot();
    if (!worktree) return { exitCode: 0 }; // not in a repo — nothing to gate

    const result = check(worktree);
    if (result.ok || result.unavailable) return { exitCode: 0 };

    const branch = getBranch() || '<unknown>';
    return {
        exitCode: 2,
        stderr: [
            `⚠️  Branch "${branch}" fails Conventional Branch (commit-check).`,
            '',
            result.output || '(no detail reported by commit-check)',
            '',
            'Conventional Branch 1.0.0 — https://conventionalbranch.org',
            '  <type>/<description>',
            '  types:    feature feat bugfix fix hotfix release chore',
            '  rules:    lowercase a-z0-9 + hyphens; dots only in release/ versions;',
            '            no underscores, uppercase, or leading/trailing/double -',
            '  examples: feat/add-login-page   fix/header-bug   release/v1.2.0',
            '',
            'Either:',
            '  • Rename the branch:  git branch -m <new-conventional-name>',
            `  • Or push yourself with the ! prefix:  ! cd "${worktree}"; git push ...`,
        ].join('\n'),
    };
}

module.exports = { run, isGitPush, checkBranch, configArgs, GLOBAL_CONFIG };
