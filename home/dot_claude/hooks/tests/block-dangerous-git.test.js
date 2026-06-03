'use strict';
/** Port safety net for block-dangerous-git.js. */

const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../bash-checks/block-dangerous-git');

const code = cmd => run({ tool_input: { command: cmd } }).exitCode;

// Pattern-based blocks (no git state needed)
const DANGEROUS = [
    'git push --force origin feature/x',
    'git push --force-with-lease',
    'git push -f origin feature/x',
    'git reset --hard HEAD~1',
    'git reset --hard',
    'git clean -fd',
    'git clean -f',
    'git checkout .',
    'git restore .',
    'git branch -D oldbranch',
    'git branch --delete --force old',
    'git push origin main',
    'git push origin develop',
    'git push origin HEAD:master',
];

// Allowed regardless of current branch (explicit feature refspec, non-git, etc.)
const SAFE = [
    'git push origin feature/login',
    'git status',
    'git commit -m "wip"',
    'git checkout feature/x',
    'git restore --staged file.ts',
    'git branch -d merged',
    'ls -la',
    'git reset HEAD file.ts',
];

for (const cmd of DANGEROUS) {
    test(`blocks: ${cmd}`, () => assert.equal(code(cmd), 2));
}
for (const cmd of SAFE) {
    test(`allows: ${cmd}`, () => assert.equal(code(cmd), 0));
}
test('empty allows', () => assert.equal(code(''), 0));
