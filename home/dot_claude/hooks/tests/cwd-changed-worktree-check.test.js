'use strict';
/** Safety net for cwd-changed-worktree-check.js — pure warningFor(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { warningFor } = require('../cwd-changed-worktree-check');

// Main checkout + a ticket branch -> warn.
for (const branch of ['feat/x', 'chore/y', 'fix/z', 'ai/thing']) {
    test(`warns: main checkout on ${branch}`, () => {
        const msg = warningFor({ branch, isMainCheckout: true });
        assert.match(msg, /MAIN checkout/);
        assert.match(msg, new RegExp(branch.replace('/', '\\/')));
    });
}

// Integration branch, a linked worktree, or no branch -> silent.
const silent = [
    { branch: 'main', isMainCheckout: true },
    { branch: 'master', isMainCheckout: true },
    { branch: 'develop', isMainCheckout: true },
    { branch: 'feat/x', isMainCheckout: false }, // in a worktree -> fine
    { branch: '', isMainCheckout: true }, // detached / no branch
];
for (const s of silent) {
    test(`silent: ${JSON.stringify(s)}`, () =>
        assert.equal(warningFor(s), ''));
}

// Defensive: bad input never throws.
test('silent: undefined/null input', () => {
    assert.equal(warningFor(undefined), '');
    assert.equal(warningFor(null), '');
});
