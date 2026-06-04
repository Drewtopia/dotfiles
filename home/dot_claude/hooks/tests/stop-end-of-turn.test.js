'use strict';
/** Tests for stop-end-of-turn.js (port of end-of-turn.sh). Run: node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const eot = require('../stop-end-of-turn.js');

const existsOf = set => p => set.has(p);

test('detectProjects maps marker files to suites', () => {
    assert.deepEqual(eot.detectProjects(existsOf(new Set(['package.json']))), [
        'nodejs',
    ]);
    assert.deepEqual(
        eot.detectProjects(existsOf(new Set(['requirements.txt']))),
        ['python'],
    );
    assert.deepEqual(eot.detectProjects(existsOf(new Set(['setup.py']))), [
        'python',
    ]);
    assert.deepEqual(eot.detectProjects(existsOf(new Set(['Cargo.toml']))), [
        'rust',
    ]);
    assert.deepEqual(eot.detectProjects(existsOf(new Set(['go.mod']))), ['go']);
});

test('detectProjects handles polyglot repos in fixed order', () => {
    const all = new Set([
        'package.json',
        'pyproject.toml',
        'Cargo.toml',
        'go.mod',
    ]);
    assert.deepEqual(eot.detectProjects(existsOf(all)), [
        'nodejs',
        'python',
        'rust',
        'go',
    ]);
});

test('detectProjects returns empty when no markers', () => {
    assert.deepEqual(eot.detectProjects(existsOf(new Set())), []);
});

test('hasHardcodedSecret flags assignment shapes', () => {
    assert.ok(eot.hasHardcodedSecret('API_KEY="abcdefghijklmnop1234"'));
    assert.ok(eot.hasHardcodedSecret("SECRET: 'aaaaaaaaaaaaaaaaaa'"));
    assert.ok(eot.hasHardcodedSecret('TOKEN="abcdefghijklmnop99"'));
});

test('hasHardcodedSecret ignores short or non-secret text', () => {
    assert.equal(eot.hasHardcodedSecret('const x = 1'), false);
    assert.equal(eot.hasHardcodedSecret('API_KEY="short"'), false);
    assert.equal(eot.hasHardcodedSecret(''), false);
});
