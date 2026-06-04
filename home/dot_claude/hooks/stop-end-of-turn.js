#!/usr/bin/env node
'use strict';
/**
 * Stop: end-of-turn quality gate.
 * Faithful port of end-of-turn.sh — detect project type(s) by marker files,
 * run the matching lint/typecheck, then scan staged files for hardcoded secrets
 * and a staged .env. Every check is best-effort and non-blocking; always exits 0.
 *
 * NOTE: kept enabled per decision, so this re-runs lint/tsc/cargo/go on each
 * Stop. Toggle off any time with HOOKS_DISABLED=stop:end-of-turn.
 */

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'stop:end-of-turn';
const TIMEOUT_MS = 30000;

const exists = p => {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
};
const safeRead = p => {
    try {
        return fs.readFileSync(p, 'utf8');
    } catch {
        return '';
    }
};

/** Pure: which project suites apply, given a file-exists predicate. */
function detectProjects(existsFn = exists) {
    const out = [];
    if (existsFn('package.json')) out.push('nodejs');
    if (
        existsFn('pyproject.toml') ||
        existsFn('setup.py') ||
        existsFn('requirements.txt')
    ) {
        out.push('python');
    }
    if (existsFn('Cargo.toml')) out.push('rust');
    if (existsFn('go.mod')) out.push('go');
    return out;
}

/** Pure: does a blob contain a hardcoded-secret assignment? (end-of-turn.sh grep) */
const SECRET_ASSIGN_RE =
    /(API_KEY|SECRET|TOKEN|PASSWORD)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}/;
function hasHardcodedSecret(text) {
    return SECRET_ASSIGN_RE.test(String(text || ''));
}

function runCheck(bin, args) {
    try {
        spawnSync(bin, args, { stdio: 'ignore', timeout: TIMEOUT_MS });
    } catch {
        /* non-blocking */
    }
}

function checkNodejs() {
    if (!exists('node_modules')) return;
    const pkg = safeRead('package.json');
    if (/"lint"/.test(pkg)) runCheck('npm', ['run', 'lint', '--silent']);
    if (exists('tsconfig.json')) {
        if (/"typecheck"/.test(pkg))
            runCheck('npm', ['run', 'typecheck', '--silent']);
        else runCheck('tsc', ['--noEmit']);
    }
}

function checkPython() {
    runCheck('ruff', ['check', '.', '--fix', '--silent']);
    runCheck('black', ['--check', '--quiet', '.']);
}

function checkRust() {
    runCheck('cargo', ['check', '--quiet']);
    runCheck('cargo', ['clippy', '--quiet', '--', '-D', 'warnings']);
}

function checkGo() {
    runCheck('go', ['vet', './...']);
    runCheck('staticcheck', ['./...']);
}

/** Warn (stderr) about staged secrets / staged .env. Returns the warnings. */
function scanStaged() {
    const warnings = [];
    if (!git(['rev-parse', '--git-dir'])) return warnings;
    const staged = git(['diff', '--cached', '--name-only'])
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    if (!staged.length) return warnings;

    for (const file of staged) {
        if (hasHardcodedSecret(safeRead(file))) {
            warnings.push(
                '⚠️  Warning: Possible hardcoded secrets in staged files',
            );
            break;
        }
    }
    if (staged.some(f => f.startsWith('.env'))) {
        warnings.push('⚠️  Warning: .env file is staged for commit!');
    }
    for (const w of warnings) process.stderr.write(w + '\n');
    return warnings;
}

function run() {
    for (const project of detectProjects()) {
        if (project === 'nodejs') checkNodejs();
        else if (project === 'python') checkPython();
        else if (project === 'rust') checkRust();
        else if (project === 'go') checkGo();
    }
    scanStaged();
    return { exitCode: 0 };
}

async function main() {
    const raw = await readStdin();
    if (
        isHookEnabled(HOOK_ID, { profiles: ['minimal', 'standard', 'strict'] })
    ) {
        try {
            run();
        } catch {
            /* never block turn end */
        }
    }
    process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = {
    run,
    detectProjects,
    hasHardcodedSecret,
    scanStaged,
    SECRET_ASSIGN_RE,
};
