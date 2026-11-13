'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'executable_session-start-behind.sh');
const run = cwd => execFileSync('bash', [HOOK], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'pipe' });

function clones() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'behind-'));
    git(dir, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
    git(dir, 'clone', '-q', 'origin.git', 'a');
    const a = path.join(dir, 'a');
    git(a, 'commit', '-q', '--allow-empty', '-m', 'one');
    git(a, 'push', '-q', '-u', 'origin', 'main');
    git(dir, 'clone', '-q', 'origin.git', 'b');
    return { a, b: path.join(dir, 'b') };
}

test('says nothing when the branch is up to date', () => {
    const { a } = clones();
    assert.strictEqual(run(a), '');
});

test('fetches and names the gap when the upstream has moved on', () => {
    const { a, b } = clones();
    git(b, 'commit', '-q', '--allow-empty', '-m', 'two');
    git(b, 'commit', '-q', '--allow-empty', '-m', 'three');
    git(b, 'push', '-q');
    assert.match(run(a), /^This checkout is 2 commits behind origin\/main/);
});

test('says nothing on a branch with no upstream', () => {
    const { a } = clones();
    git(a, 'switch', '-q', '-c', 'local-only');
    assert.strictEqual(run(a), '');
});
