'use strict';

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
    'git worktree add ../x -b feat/x',
    'git -C /repo worktree add .claude/worktrees/x origin/develop',
    'git worktree remove --force .claude/worktrees/x',
    'git worktree remove -f x',
    'cd /repo && git push origin develop',
    "bash -c 'git push origin main'",
    "bash -lc 'git push origin main'",
    'mise exec -- git push origin develop',
    'out=$(git push origin main)',
    'git push -u origin feat/x && git push origin develop',
    'cd /repo && git reset --hard',
    "bash -lc 'git clean -fd'",
    'git branch -a | xargs git branch -D',
    'git status && git checkout .',
    'git --no-pager branch -D old',
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
    'git switch -c feat/carry-changes',
    'git worktree list',
    'git worktree remove x',
    'git checkout -b feat/x',
    'git push -u origin feat/x && az repos pr create --target-branch develop',
    'git push origin feat/x; git log origin/develop..HEAD',
    'git push origin feat/x && pnpm install --force',
    'git clean -n && ls -lf',
    'git stash && git reset HEAD file.ts && echo --hard',
    'git branch -vv && grep -D skip notes.txt',
    'git status && rg "git\\s+reset(\\s+.*)?\\s+--hard" hooks/',
    'git worktree list && rm -f stale.lock',
];

for (const cmd of DANGEROUS) {
    test(`blocks: ${cmd}`, () => assert.equal(code(cmd), 2));
}
for (const cmd of SAFE) {
    test(`allows: ${cmd}`, () => assert.equal(code(cmd), 0));
}
test('empty allows', () => assert.equal(code(''), 0));

// A bare push pushes the branch checked out where that push runs.
const bare = (cmd, branches) =>
    run({ tool_input: { command: cmd } }, { currentBranch: cwd => branches[cwd || ''] }).exitCode;

test('blocks: bare push on develop', () => assert.equal(bare('git push', { '': 'develop' }), 2));
test('blocks: bare push on develop followed by another command', () =>
    assert.equal(bare('git push && echo done', { '': 'develop' }), 2));
test('allows: bare push in a feature worktree reached by cd', () =>
    assert.equal(bare('cd /wt && git push -u origin', { '': 'develop', '/wt': 'feat/x' }), 0));
test('blocks: bare push in a develop checkout reached by cd', () =>
    assert.equal(bare('cd /repo && git push', { '': 'feat/x', '/repo': 'develop' }), 2));
