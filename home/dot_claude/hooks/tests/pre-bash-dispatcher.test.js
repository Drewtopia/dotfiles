'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { runChecks } = require('../pre-bash-dispatcher');

const input = { tool_input: { command: 'ls' } };
const allow = { id: 'allow', run: () => ({ exitCode: 0 }) };
const block = { id: 'block', run: () => ({ exitCode: 2, stderr: 'nope' }) };
const crash = {
    id: 'crash',
    run: () => {
        throw new Error('boom');
    },
};

test('allows when every check allows', () => {
    assert.equal(runChecks(input, [allow, allow]).exitCode, 0);
});

test('blocks with the first blocking check', () => {
    const res = runChecks(input, [allow, block]);
    assert.equal(res.exitCode, 2);
    assert.equal(res.stderr, 'nope');
});

test('a crashing check blocks the command', () => {
    const res = runChecks(input, [crash, allow]);
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /crash errored: boom/);
});

test('runs the UAT and live-ports gate', () => {
    const { spawnSync } = require('node:child_process');
    const os = require('node:os');
    const path = require('node:path');
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'pre-bash-dispatcher.js')], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'mise -E uat run smoke' } }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_CONFIG_DIR: os.tmpdir(), HOOKS_DISABLED: '' },
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /UAT/);
});
