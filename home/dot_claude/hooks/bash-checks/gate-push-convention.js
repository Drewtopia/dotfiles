'use strict';
// Gates `git push` on the CURRENT branch passing commit-check's Conventional Branch
// rules; a cross-branch refspec is not checked. Allows when commit-check is absent,
// so a half-provisioned machine can still push.

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

// commit-check has no global config search path, so pass the global file via
// --config unless a repo-local config exists.
function configArgs(cwd, opts = {}) {
    const exists = opts.exists || fs.existsSync;
    const global = opts.global || GLOBAL_CONFIG;
    if (REPO_CONFIGS.some(f => exists(path.join(cwd, f)))) return [];
    if (exists(global)) return ['--config', global];
    return [];
}

const stripMiseNoise = s =>
    String(s || '')
        .split('\n')
        .filter(line => !/^mise (WARN|ERROR)/.test(line))
        .join('\n')
        .trim();

function checkBranch(cwd) {
    const flags = ['--branch', '--no-banner', ...configArgs(cwd)];
    const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    // `mise x` covers the window where the tool is installed but not yet activated
    // and the bare shim errors "No version is set".
    const invocations = [
        ['commit-check', flags],
        ['mise', ['x', 'pipx:commit-check@latest', '--', 'commit-check', ...flags]],
    ];

    let unrun = false;
    for (let i = 0; i < invocations.length; i++) {
        const [bin, args] = invocations[i];
        const haveFallback = i < invocations.length - 1;
        try {
            execFileSync(bin, args, opts);
            return { ok: true };
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                unrun = true;
                continue;
            }
            const raw = [err.stdout, err.stderr]
                .map(s => String(s || ''))
                .join('\n');
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
    if (!worktree) return { exitCode: 0 };

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
