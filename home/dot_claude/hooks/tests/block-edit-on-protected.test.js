'use strict';
/** Safety net for block-edit-on-protected.js — denialFor() and branchFor(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { denialFor, branchFor } = require('../block-edit-on-protected');

// Protected branches produce a denial naming the branch.
for (const branch of ['main', 'master', 'develop']) {
    test(`denies on ${branch}`, () => {
        const msg = denialFor(branch);
        assert.match(msg, /protected branch/);
        assert.match(msg, new RegExp(branch));
    });
}

// Feature branches and unknown branches stay silent.
for (const branch of ['feat/login', 'fix/x', 'release/1.2', '', undefined]) {
    test(`allows ${JSON.stringify(branch)}`, () =>
        assert.equal(denialFor(branch), ''));
}

/** A throwaway repo on `develop` with a worktree on `feat/x` and a .gitignore. */
function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'block-edit-'));
    const run = (...args) =>
        execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
    run('init', '-q', '-b', 'develop');
    run('config', 'user.email', 't@t');
    run('config', 'user.name', 't');
    writeFileSync(join(root, '.gitignore'), 'ignored/\n');
    mkdirSync(join(root, 'ignored'));
    writeFileSync(join(root, 'ignored', 'local.txt'), '');
    writeFileSync(join(root, 'tracked.txt'), '');
    run('add', '-A');
    run('commit', '-qm', 'init');
    const wt = `${root}-wt`;
    run('worktree', 'add', '-q', '-b', 'feat/x', wt);
    return { root, wt };
}

test('tracked file on develop reports develop', () => {
    const { root } = fixture();
    assert.equal(branchFor(join(root, 'tracked.txt')), 'develop');
});

test('gitignored file is exempt even on develop', () => {
    const { root } = fixture();
    assert.equal(branchFor(join(root, 'ignored', 'local.txt')), '');
});

// The regression that motivated the rewrite: cwd is irrelevant, the file's own
// checkout decides. Running from the develop root must still see feat/x.
test('file inside a worktree reports the worktree branch, not cwd', () => {
    const { root, wt } = fixture();
    const cwd = process.cwd();
    process.chdir(root);
    try {
        assert.equal(branchFor(join(wt, 'tracked.txt')), 'feat/x');
    } finally {
        process.chdir(cwd);
    }
});

test('path outside any repo allows', () =>
    assert.equal(branchFor('/nonexistent-xyz/file.txt'), ''));

// The bypass this hook shipped with: Write can target a directory that does not
// exist yet, `git -C <missing>` exits non-zero, git() swallows it to '' and the
// edit was allowed straight through on develop. Walking up to the nearest
// existing ancestor keeps the checkout identifiable.
test('new file under a not-yet-existing directory still reports develop', () => {
    const { root } = fixture();
    assert.equal(
        branchFor(join(root, 'no', 'such', 'dir', 'new.ts')),
        'develop',
    );
});
