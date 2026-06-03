'use strict';
/**
 * Port safety net for gate-push-convention.js — deterministic paths only.
 * (The bare-push block path depends on the live current branch, so it is
 * verified end-to-end from a non-repo cwd rather than here.)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../bash-checks/gate-push-convention');

const code = cmd => run({ tool_input: { command: cmd } }).exitCode;

// Deferred or allowed regardless of current branch:
const ALLOWED = [
    'git status', // not a push
    'npm test', // not git
    'git push --force origin feat/x', // force -> defer to block-dangerous-git
    'git push origin main', // protected -> defer
    'git push origin develop', // protected -> defer
    'git push origin feat/login', // conventional refspec present
    'git push origin fix(api)/null-deref', // conventional w/ scope
    'git push origin feat!/breaking', // conventional w/ breaking marker
    'git push origin chore/oxlint-fix',
];

for (const cmd of ALLOWED) {
    test(`allows/defers: ${cmd}`, () => assert.equal(code(cmd), 0));
}

// Argful push whose target is non-conventional and non-protected blocks,
// independent of the current branch (the explicit target drives the decision).
test('blocks argful push to non-conventional target', () => {
    assert.equal(code('git push origin randombranch'), 2);
});
