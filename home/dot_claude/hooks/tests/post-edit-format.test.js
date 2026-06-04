'use strict';
/** Tests for post-edit-format.js (port of after-edit.sh). Run: node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const fmt = require('../post-edit-format.js');

test('prettier handles web extensions', () => {
    for (const ext of [
        'ts',
        'tsx',
        'js',
        'json',
        'md',
        'css',
        'html',
        'yaml',
    ]) {
        const got = fmt.formattersFor(`a.${ext}`);
        assert.equal(got.length, 1);
        assert.equal(got[0].bin, 'prettier');
        assert.deepEqual(got[0].args, ['--write', `a.${ext}`]);
    }
});

test('python runs black then ruff', () => {
    const got = fmt.formattersFor('mod.py');
    assert.deepEqual(
        got.map(f => f.bin),
        ['black', 'ruff'],
    );
});

test('go/rust/shell map to their formatters', () => {
    assert.equal(fmt.formattersFor('main.go')[0].bin, 'gofmt');
    assert.equal(fmt.formattersFor('lib.rs')[0].bin, 'rustfmt');
    assert.equal(fmt.formattersFor('run.sh')[0].bin, 'shfmt');
    assert.equal(fmt.formattersFor('run.bash')[0].bin, 'shfmt');
});

test('unknown / extensionless files get no formatter', () => {
    assert.deepEqual(fmt.formattersFor('Makefile'), []);
    assert.deepEqual(fmt.formattersFor('a.lock'), []);
    assert.deepEqual(fmt.formattersFor(''), []);
});

test('extractFilePath reads file_path then path', () => {
    assert.equal(
        fmt.extractFilePath({ tool_input: { file_path: 'a.ts' } }),
        'a.ts',
    );
    assert.equal(fmt.extractFilePath({ tool_input: { path: 'b.ts' } }), 'b.ts');
    assert.equal(fmt.extractFilePath({ tool_input: {} }), '');
});

test('run is a no-op (exit 0) for files with no formatter', () => {
    assert.deepEqual(fmt.run({ tool_input: { file_path: 'Makefile' } }), {
        exitCode: 0,
    });
});
