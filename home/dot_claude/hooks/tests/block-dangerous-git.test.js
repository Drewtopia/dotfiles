'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../bash-checks/block-dangerous-git');

// The checkout is never a primary one with worktrees here; the branch-move cases below say otherwise.
const code = cmd => run({ tool_input: { command: cmd } }, { isPrimaryOfMany: () => false }).exitCode;

// Force-pushes, pushes naming a protected branch and the destructive git commands are dcg's
// (core.git and ~/.config/dcg/packs/git-policy.yaml); this guard only sees what needs git state.

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

for (const cmd of SAFE) {
    test(`allows: ${cmd}`, () => assert.equal(code(cmd), 0));
}
test('empty allows', () => assert.equal(code(''), 0));

// A primary checkout that has worktrees keeps its branch (git state faked through deps).
const moves = (cmd, { primary = true, refs = ['feat/x'] } = {}) =>
    run(
        { tool_input: { command: cmd } },
        { isPrimaryOfMany: () => primary, isRef: (_, name) => refs.includes(name) },
    ).exitCode;

test('blocks moving the branch of a primary checkout', () => {
    for (const cmd of [
        'git switch feat/x',
        'git switch -c feat/new',
        'git checkout feat/x',
        'git checkout -b feat/new',
        'git -C /repo checkout feat/x',
        'git branch -f feat/x origin/develop',
        'cd /repo && git switch develop',
    ]) {
        assert.equal(moves(cmd), 2, cmd);
    }
});

test('allows file restores, listings and linked worktrees', () => {
    for (const cmd of [
        'git checkout -- src/a.ts',
        'git checkout feat/x -- src/a.ts',
        'git checkout src/a.ts',
        'git branch',
        'git branch -d old',
        'git branch -m new-name',
        'git status',
    ]) {
        assert.equal(moves(cmd), 0, cmd);
    }
    assert.equal(moves('git switch feat/x', { primary: false }), 0);
});

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

// The hook reads the command before the shell expands it.
const home = require('node:os').homedir();
test('blocks: bare push in a directory named by a variable, judged by the session branch', () => {
    assert.equal(bare('git -C $V push', { '': 'main' }), 2);
    assert.equal(bare('cd "$X" && git push', { '': 'develop' }), 2);
});
test('resolves a variable assigned earlier in the same command', () => {
    const branches = { '': 'feat/x', [`${home}/.claude-vault`]: 'main' };
    assert.equal(bare('V=~/.claude-vault; git -C $V push', branches), 2);
    assert.equal(bare('R=$HOME/.claude-vault && cd "${R}" && git push', branches), 2);
});
test('resolves ~ and $HOME in the push directory', () => {
    assert.equal(bare('git -C ~/repo push', { '': 'feat/x', [`${home}/repo`]: 'main' }), 2);
    assert.equal(bare('cd $HOME/wt && git push -u origin', { '': 'develop', [`${home}/wt`]: 'feat/x' }), 0);
});

const COMMIT_THEN_PUSH = [
    "cd /wt && git commit -q -F - <<'EOF'",
    "fix: the user's role no longer matters",
    'EOF',
    `git push -q -u origin fix/any-role 2>&1 | tail -1; gh pr create --base develop --json number -q '.number'`,
].join('\n');

test('allows: a feature push after a heredoc whose body holds an apostrophe', () =>
    assert.equal(code(COMMIT_THEN_PUSH), 0));
test('allows: a data heredoc body that mentions a protected push', () =>
    assert.equal(code("cat > notes.md <<'EOF'\ngit push origin main\nEOF"), 0));
