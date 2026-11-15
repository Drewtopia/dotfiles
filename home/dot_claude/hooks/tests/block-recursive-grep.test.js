'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../bash-checks/block-recursive-grep');

const check = command => run({ tool_input: { command } });

const DENIED = [
    "grep -rn 'entropy|random-token' docs README.md src --include=*.md --include=*.rs | head -20",
    'grep -r TODO .',
    'grep -R --include=*.ts foo src',
    'grep -rli password .',
    'grep --recursive foo docs',
    'grep -d recurse foo docs',
    'grep --directories=recurse foo docs',
    'grep --directories recurse foo docs',
    'grep -drecurse foo docs',
    'grep -nr foo .',
    'egrep -r "a|b" src',
    'cd docs && grep -rn foo .',
    'git status; grep -rn foo src',
    'sudo grep -r foo /etc',
    '/usr/bin/grep -rn foo .',
];

const ALLOWED = [
    'git log --oneline | grep fix',
    'grep -n foo src/main.rs',
    'grep -c error build.log',
    'grep -e -r file.txt',
    'grep -er file.txt',
    'grep -A2 -e foo file.txt',
    'grep -- -r file.txt',
    "rg -n 'foo' src",
    'git grep -n foo',
    'find . -name "*.rs" | xargs grep -n foo',
    "echo 'grep -r foo .'",
    "cat > notes.md <<'EOF'\nRun grep -r foo . to find it.\nEOF",
];

test('blocks recursive grep', () => {
    for (const cmd of DENIED) assert.equal(check(cmd).exitCode, 2, cmd);
});

test('allows grep on files and pipes, and rg', () => {
    for (const cmd of ALLOWED) assert.equal(check(cmd).exitCode, 0, cmd);
});

test('the message names rg and how to search ignored files', () => {
    const { stderr } = check('grep -rn foo .');
    assert.match(stderr, /rg 'pattern' path/);
    assert.match(stderr, /rg -uu/);
});
