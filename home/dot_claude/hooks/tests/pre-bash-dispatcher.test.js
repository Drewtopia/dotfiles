'use strict';
/** Tests for pre-bash-dispatcher.js runChecks(). Run: node --test */

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
