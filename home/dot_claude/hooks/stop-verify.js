#!/usr/bin/env node
'use strict';
// Stop: typecheck what the turn changed before Claude stops. Runs only in a moon
// workspace, only when TypeScript differs from the default branch, and only when the
// tree changed since the last pass, so a question-and-answer turn costs nothing.
// A failure exits 2 so Claude fixes it; after MAX_FAILS in a row the hook lets it stop.
// Lint runs per edit in post-edit-format.js; unit tests stay on the repo's pre-push.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git, repoRoot } = require('./lib/git');

const HOOK_ID = 'stop:verify';
const MAX_FAILS = 3;
const TIMEOUT_MS = 540_000;
const TAIL_LINES = 60;
const TS_FILE = /\.(?:ts|tsx|mts|cts)$/;

const hasTypeScript = files => files.some(f => TS_FILE.test(f));

const fingerprint = (head, status, diff) =>
    crypto.createHash('sha1').update(`${head}\n${status}\n${diff}`).digest('hex');

const stateFile = sessionId =>
    path.join(os.tmpdir(), 'claude-stop-verify', `${String(sessionId || 'none').replace(/\W/g, '')}.json`);

function readState(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
}

function writeState(file, state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
}

const tail = (text, n) => text.trim().split('\n').slice(-n).join('\n');

function changedFiles(root, base) {
    const committed = git(['-C', root, 'diff', '--name-only', `${base}...HEAD`]);
    const working = git(['-C', root, 'status', '--porcelain']).split('\n').map(l => l.slice(3));
    return [...committed.split('\n'), ...working].filter(Boolean);
}

async function main() {
    const input = parseInput(await readStdin());
    if (!isHookEnabled(HOOK_ID)) return 0;

    const root = repoRoot(input.cwd);
    if (!root || !fs.existsSync(path.join(root, '.moon', 'workspace.yml'))) return 0;

    const base = git(['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    if (!base || !hasTypeScript(changedFiles(root, base))) return 0;

    const print = fingerprint(
        git(['-C', root, 'rev-parse', 'HEAD']),
        git(['-C', root, 'status', '--porcelain']),
        git(['-C', root, 'diff', 'HEAD']),
    );
    const file = stateFile(input.session_id);
    const state = readState(file);
    if (state.passed === print) return 0;
    if (state.failed === print && state.fails >= MAX_FAILS) return 0;

    const run = spawnSync('moon', ['run', ':typecheck', '--affected'], {
        cwd: root,
        env: { ...process.env, MOON_BASE: base },
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
    });
    if (run.error || run.status === 0) {
        // A missing moon or a timeout is not a type error Claude can fix.
        if (!run.error) writeState(file, { passed: print });
        return 0;
    }

    const fails = state.failed === print ? state.fails + 1 : 1;
    writeState(file, { failed: print, fails });
    process.stderr.write(
        `moon run :typecheck --affected failed (attempt ${fails} of ${MAX_FAILS}). Fix before stopping:\n` +
            tail(`${run.stdout}\n${run.stderr}`, TAIL_LINES) +
            '\n',
    );
    return 2;
}

if (require.main === module)
    main().then(
        code => process.exit(code),
        err => {
            process.stderr.write(`[hook] ${HOOK_ID} errored: ${err && err.message}\n`);
            process.exit(0);
        },
    );

module.exports = { hasTypeScript, fingerprint, stateFile, tail };
