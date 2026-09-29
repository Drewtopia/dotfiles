'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fmt = require('../post-edit-format.js');

// A repo at /r holding `files`; a tool is installed when node_modules/.bin/<tool> is listed.
const repo = (files, pkg = {}) => ({
    exists: p => files.includes(p.replace(/^\/r\//, '')),
    readPackage: () => pkg,
});
const bin = tool => `node_modules/.bin/${tool}`;
const bins = list => list.map(t => t.bin.replace(/^\/r\//, ''));

test('the repo config picks the formatter, run from its own node_modules', () => {
    const cases = [
        [['.oxfmtrc.json', bin('oxfmt')], 'a.ts', 'oxfmt'],
        [['.prettierrc', bin('prettier')], 'a.ts', 'prettier'],
        [['prettier.config.mjs', bin('prettier')], 'notes.md', 'prettier'],
        [['biome.json', bin('biome')], 'a.tsx', 'biome'],
    ];
    for (const [files, file, tool] of cases) {
        assert.deepEqual(bins(fmt.formattersFor(file, '/r', repo(files))), [bin(tool)], file);
    }
});

test('a "prettier" key in package.json counts as prettier config', () => {
    const got = fmt.formattersFor('a.ts', '/r', repo([bin('prettier')], { prettier: {} }));
    assert.deepEqual(bins(got), [bin('prettier')]);
});

test('no formatter without a config, an installed binary, or a git root', () => {
    assert.deepEqual(fmt.formattersFor('a.ts', '/r', repo([bin('prettier')])), []);
    assert.deepEqual(fmt.formattersFor('a.ts', '/r', repo(['.prettierrc'])), []);
    assert.deepEqual(fmt.formattersFor('a.ts', '', repo(['.prettierrc', bin('prettier')])), []);
    assert.deepEqual(fmt.formattersFor('notes.md', '/r', repo(['.oxfmtrc.json', bin('oxfmt')])), []);
});

test('the repo config picks the linters', () => {
    const both = repo(['oxlint.config.ts', bin('oxlint'), 'eslint.config.js', bin('eslint')]);
    assert.deepEqual(bins(fmt.lintersFor('a.ts', '/r', both)), [bin('oxlint'), bin('eslint')]);
    assert.deepEqual(bins(fmt.lintersFor('a.ts', '/r', repo(['.eslintrc.json', bin('eslint')]))), [bin('eslint')]);
    assert.deepEqual(bins(fmt.lintersFor('a.ts', '/r', repo([bin('eslint')]))), []);
    assert.deepEqual(bins(fmt.lintersFor('notes.md', '/r', both)), []);
});

test('python, go, rust and shell keep their PATH formatters', () => {
    assert.deepEqual(fmt.formattersFor('mod.py', '', repo([])).map(f => f.bin), ['black', 'ruff']);
    assert.equal(fmt.formattersFor('main.go', '', repo([]))[0].bin, 'gofmt');
    assert.equal(fmt.formattersFor('lib.rs', '', repo([]))[0].bin, 'rustfmt');
    assert.equal(fmt.formattersFor('run.sh', '', repo([]))[0].bin, 'shfmt');
});

test('unknown / extensionless files get no tools', () => {
    for (const file of ['Makefile', 'a.lock', '']) {
        assert.deepEqual(fmt.formattersFor(file, '/r', repo([])), []);
        assert.deepEqual(fmt.lintersFor(file, '/r', repo([])), []);
    }
});

test('extractFilePath reads file_path then path', () => {
    assert.equal(fmt.extractFilePath({ tool_input: { file_path: 'a.ts' } }), 'a.ts');
    assert.equal(fmt.extractFilePath({ tool_input: { path: 'b.ts' } }), 'b.ts');
    assert.equal(fmt.extractFilePath({ tool_input: {} }), '');
});

// run(): formats, then lints; only a linter reporting errors (exit 1) blocks.
const lintRepo = status => {
    const calls = [];
    const deps = {
        ...repo(['.oxfmtrc.json', bin('oxfmt'), 'oxlint.config.ts', bin('oxlint')]),
        repoRoot: () => '/r',
        spawn: (cmd, args) => {
            calls.push(cmd.replace(/^\/r\//, ''));
            return cmd.endsWith('oxlint') ? { status, stdout: 'a.ts:1:1: error no-debugger', stderr: '' } : { status: 0 };
        },
    };
    return { deps, calls };
};

test('run formats before it lints, and feeds lint errors back with exit 2', () => {
    const { deps, calls } = lintRepo(1);
    const res = fmt.run({ tool_input: { file_path: '/r/a.ts' } }, deps);
    assert.deepEqual(calls, [bin('oxfmt'), bin('oxlint')]);
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /no-debugger/);
});

test('run passes a clean lint and ignores a linter crash or timeout', () => {
    for (const status of [0, 2, null]) {
        const { deps } = lintRepo(status);
        assert.equal(fmt.run({ tool_input: { file_path: '/r/a.ts' } }, deps).exitCode, 0, String(status));
    }
});

test('run is a no-op (exit 0) for files with no tools', () => {
    const { deps, calls } = lintRepo(1);
    assert.equal(fmt.run({ tool_input: { file_path: '/r/Makefile' } }, deps).exitCode, 0);
    assert.deepEqual(calls, []);
});
