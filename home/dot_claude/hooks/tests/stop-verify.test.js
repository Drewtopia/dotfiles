'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasTypeScript, fingerprint, stateFile, tail } = require('../stop-verify.js');

test('only TypeScript sources trigger a typecheck', () => {
    assert.equal(hasTypeScript(['a/b.ts']), true);
    assert.equal(hasTypeScript(['a/b.tsx', 'c.md']), true);
    assert.equal(hasTypeScript(['README.md', 'x.js', 'y.json']), false);
    assert.equal(hasTypeScript([]), false);
});

test('fingerprint changes with HEAD, status or diff', () => {
    const base = fingerprint('h', ' M a.ts', 'diff1');
    assert.equal(base, fingerprint('h', ' M a.ts', 'diff1'));
    assert.notEqual(base, fingerprint('h2', ' M a.ts', 'diff1'));
    assert.notEqual(base, fingerprint('h', ' M b.ts', 'diff1'));
    assert.notEqual(base, fingerprint('h', ' M a.ts', 'diff2'));
});

test('state file name strips path characters from the session id', () => {
    assert.ok(stateFile('../../etc/x').endsWith('etcx.json'));
    assert.ok(stateFile(undefined).endsWith('none.json'));
});

test('tail keeps the last lines', () => {
    assert.equal(tail('1\n2\n3\n4', 2), '3\n4');
});
