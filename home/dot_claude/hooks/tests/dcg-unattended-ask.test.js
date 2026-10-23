'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../dcg-unattended-ask.js');

const input = { tool_name: 'Bash', tool_input: { command: 'qm stop 101' } };
const dcgSays = decision => () => ({
    status: 0,
    stdout: decision
        ? JSON.stringify({ hookSpecificOutput: { permissionDecision: decision, permissionDecisionReason: 'Rule: drew.homelab:proxmox-guest-stop' } })
        : '',
});

test('attended session: never runs dcg, passes', () => {
    let ran = false;
    const res = guard.run(input, { env: { CLAUDE_CODE_SESSION_ATTENDED: '1' }, runDcg: () => { ran = true; } });
    assert.equal(res.exitCode, 0);
    assert.equal(ran, false);
});

test('unattended session: a dcg ask becomes a deny', () => {
    const res = guard.run(input, { env: { CLAUDE_CODE_SESSION_ATTENDED: '0' }, runDcg: dcgSays('ask') });
    assert.equal(res.exitCode, 0);
    const out = JSON.parse(res.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /unattended/);
    assert.match(out.permissionDecisionReason, /proxmox-guest-stop/);
});

test('flag unset counts as unattended', () => {
    const res = guard.run(input, { env: {}, runDcg: dcgSays('ask') });
    assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('unattended session: dcg allow or deny is left to the dcg hook', () => {
    for (const decision of [null, 'deny', 'allow']) {
        const res = guard.run(input, { env: {}, runDcg: dcgSays(decision) });
        assert.equal(res.exitCode, 0, String(decision));
        assert.equal(res.stdout, undefined, String(decision));
    }
});

test('unattended session: dcg missing, timed out or crashed blocks', () => {
    for (const result of [{ error: new Error('ENOENT') }, { status: null, signal: 'SIGTERM' }, { status: 1, stdout: '' }]) {
        const res = guard.run(input, { env: {}, runDcg: () => result });
        assert.equal(res.exitCode, 2);
        assert.match(res.stderr, /dcg-unattended-ask/);
    }
});
