'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'executable_session-start-mistakes.sh');

const LOG = `# MISTAKES.md

Newest first.

## 2026-09-08 Called a guard a bug without reading it

**What happened** — Reported a working guard as broken.

**Prevention** — Read the source that governs a behaviour
before naming it a defect.

**Recurred** — 2026-11-10: did it again.

## 2026-09-07 Pushed to main

**Root cause** — Skipped the branch check.

**Prevention** — Branch first.

## 2026-09-06 Packed labels with colons
**What happened:** Ran it.
**Prevention:** Check the colon form.
**Consequence:** Should not show.

## 2026-09-05 Bulleted labels

- **Root cause:** Should not show.
- **Prevention:** Check the bullet form.
`;

function repoWithWorktree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mistakes-'));
    const main = path.join(dir, 'main');
    const git = (...args) => execFileSync('git', args, { cwd: main, stdio: 'pipe' });
    fs.mkdirSync(main);
    git('init', '-q', '-b', 'main');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git('worktree', 'add', '-q', '-b', 'side', path.join(dir, 'wt'));
    return { dir, main, wt: path.join(dir, 'wt') };
}

const run = cwd => execFileSync('bash', [HOOK], { cwd, encoding: 'utf8' });

test('a worktree session sees the main checkout log as headings, Prevention and Recurred lines only', () => {
    const { main, wt } = repoWithWorktree();
    fs.writeFileSync(path.join(main, 'MISTAKES.md'), LOG);
    const out = run(wt);
    assert.match(out, /^Mistakes made in this repo before/);
    assert.match(out, /## 2026-09-08 Called a guard a bug without reading it\n\*\*Prevention\*\* — Read the source that governs a behaviour\nbefore naming it a defect\.\n\*\*Recurred\*\* — 2026-11-10/);
    assert.match(out, /## 2026-09-07 Pushed to main\n\*\*Prevention\*\* — Branch first\./);
    assert.match(out, /## 2026-09-06 Packed labels with colons\n\*\*Prevention:\*\* Check the colon form\.\n\n/);
    assert.match(out, /## 2026-09-05 Bulleted labels\n- \*\*Prevention:\*\* Check the bullet form\.\n$/);
    assert.doesNotMatch(out, /What happened|Root cause|Consequence|Should not show|Newest first/);
});

test('reads a tracked log only from a Drewtopia repo', () => {
    const { main, wt } = repoWithWorktree();
    const git = (...args) => execFileSync('git', args, { cwd: main, stdio: 'pipe' });
    fs.writeFileSync(path.join(main, 'MISTAKES.md'), LOG);
    git('add', 'MISTAKES.md');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'log');
    git('remote', 'add', 'origin', 'git@github.com:someone/cloned.git');
    assert.strictEqual(run(wt), '');
    git('remote', 'set-url', 'origin', 'https://evil.example/github.com/Drewtopia/x.git');
    assert.strictEqual(run(wt), '');
    git('remote', 'set-url', 'origin', 'git@github.com:Drewtopia/claude-vault.git');
    assert.match(run(wt), /## 2026-09-07 Pushed to main/);
});

test('a tracked log under another case still counts as tracked', () => {
    const { main, wt } = repoWithWorktree();
    const git = (...args) => execFileSync('git', args, { cwd: main, stdio: 'pipe' });
    fs.writeFileSync(path.join(main, 'mistakes.md'), LOG);
    git('add', 'mistakes.md');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'log');
    git('remote', 'add', 'origin', 'git@github.com:someone/cloned.git');
    if (!fs.existsSync(path.join(main, 'MISTAKES.md'))) return; // case-sensitive disk: nothing to read
    assert.strictEqual(run(wt), '');
});

test('refuses a symlinked log', () => {
    const { main, wt, dir } = repoWithWorktree();
    fs.writeFileSync(path.join(dir, 'elsewhere.md'), LOG);
    fs.symlinkSync(path.join(dir, 'elsewhere.md'), path.join(main, 'MISTAKES.md'));
    assert.strictEqual(run(wt), '');
});

test('says nothing without a log or outside a repo', () => {
    const { wt, dir } = repoWithWorktree();
    assert.strictEqual(run(wt), '');
    const bare = path.join(dir, 'not-a-repo');
    fs.mkdirSync(bare);
    assert.strictEqual(run(bare), '');
});
