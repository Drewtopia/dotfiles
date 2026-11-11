#!/usr/bin/env node
'use strict';
// PreToolUse(Bash|PowerShell|Monitor): in an unattended session (claude -p, SDK,
// scheduled runs) auto mode approves a dcg "ask" with no human, so the ask runs.
// This hook re-runs dcg there and turns its ask into a deny. Attended sessions
// exit at once and keep the normal approval prompt.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readStdin, parseInput } = require('./lib/hook-io');

const DCG_TIMEOUT_MS = 5000;

// dcg writes its own absolute path into settings.json on every run; use that
// binary, since a hook's PATH may lack the mise shims.
function dcgFromSettings() {
    const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    try {
        const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
        for (const entry of settings?.hooks?.PreToolUse || [])
            for (const hook of entry.hooks || [])
                if (/(^|[\\/])dcg(\.exe)?$/.test(hook.command || '')) return hook.command;
    } catch {}
    return null;
}

function defaultRunDcg(raw) {
    return spawnSync(dcgFromSettings() || 'dcg', [], { input: raw, encoding: 'utf8', timeout: DCG_TIMEOUT_MS });
}

function block(reason) {
    return { exitCode: 2, stderr: `[hook] dcg-unattended-ask: ${reason}; blocking because this session is unattended.` };
}

function run(input, { env = process.env, runDcg = defaultRunDcg, raw = JSON.stringify(input) } = {}) {
    if (env.CLAUDE_CODE_SESSION_ATTENDED === '1') return { exitCode: 0 };

    const res = runDcg(raw) || {};
    if (res.error) return block(`dcg did not run (${res.error.message})`);
    if (res.status !== 0) return block(`dcg exited ${res.status ?? res.signal}`);

    let decision;
    let reason = '';
    try {
        const out = res.stdout && res.stdout.trim() ? JSON.parse(res.stdout).hookSpecificOutput || {} : {};
        decision = out.permissionDecision;
        reason = out.permissionDecisionReason || '';
    } catch {
        return block('dcg output was not JSON');
    }
    if (decision !== 'ask') return { exitCode: 0 };

    return {
        exitCode: 0,
        stdout: JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason:
                    'dcg wants a human to approve this, and this session is unattended ' +
                    '(CLAUDE_CODE_SESSION_ATTENDED is not 1), so it is denied. ' +
                    `Run it from an attended session instead.\n\n${reason}`,
            },
        }),
    };
}

async function main() {
    const raw = await readStdin();
    const res = run(parseInput(raw), { raw });
    if (res.exitCode === 2) {
        process.stderr.write(res.stderr + '\n');
        process.exit(2);
    }
    if (res.stdout) process.stdout.write(res.stdout);
    process.exit(0);
}

if (require.main === module)
    main().catch(err => {
        process.stderr.write(`[hook] dcg-unattended-ask errored: ${err && err.message}\n`);
        process.exit(2);
    });

module.exports = { run };
