#!/usr/bin/env node
'use strict';
/**
 * Stop: end-of-turn staged-file scan.
 * Scans staged files for hardcoded credentials and a staged .env, warning on
 * stderr. Best-effort and non-blocking; always exits 0.
 *
 * NOTE: this used to also run lint/typecheck (ported from end-of-turn.sh), but
 * spawned them with stdio:'ignore' and never read the exit status, so the
 * results were discarded — ~13.5s median per turn, 108s worst case, for output
 * nothing could see. In a moon monorepo `npm run lint` is a whole-repo build
 * that misses cache on exactly the turns that edited files. Committed code is
 * still gated by lefthook pre-commit, which lints staged files by design.
 * Toggle this hook off any time with HOOKS_DISABLED=stop:end-of-turn.
 */

const fs = require('node:fs');
const { readStdin } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'stop:end-of-turn';

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
