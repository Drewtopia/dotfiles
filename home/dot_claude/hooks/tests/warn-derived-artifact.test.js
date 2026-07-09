'use strict';
/** Safety net for warn-derived-artifact.js — pure noticeFor()/extractFilePath(). */

const { test } = require('node:test');
const assert = require('node:assert');
const {
    noticeFor,
    isDerived,
    extractFilePath,
} = require('../warn-derived-artifact');

// Summaries of other things: reading them warrants a re-verify nudge.
const DERIVED = [
    '/Users/drew/proj/MEMORY.md',
    '/Users/drew/proj/memory.md',
    '/Users/drew/proj/SESSION_LOG.md',
    '/Users/drew/proj/handoff.md',
    '/Users/drew/proj/handoff-2026-07-09.md',
    '/Users/drew/proj/plans/refactor.md',
    '/Users/drew/.claude/memory/tools/chezmoi.md',
    'C:\\Users\\drew\\proj\\plans\\refactor.md',
];
for (const p of DERIVED) {
    test(`derived: ${p}`, () => {
        assert.ok(isDerived(p));
        assert.match(noticeFor(p), /claim, not a canonical source/);
    });
}

// Canonical sources and instruction files: silent. Firing here is pure noise.
const CANONICAL = [
    '/Users/drew/.claude/rules/verify-dont-trust.md',
    '/Users/drew/.claude/skills/foo/SKILL.md',
    '/Users/drew/proj/CLAUDE.md',
    '/Users/drew/proj/README.md',
    '/Users/drew/proj/src/index.js',
    '/Users/drew/proj/docs/plans-old/x.md',
    '/Users/drew/proj/plans/notes.txt',
    '',
    undefined,
];
for (const p of CANONICAL) {
    test(`canonical: ${JSON.stringify(p)}`, () => {
        assert.equal(isDerived(p), false);
        assert.equal(noticeFor(p), '');
    });
}

// Path extraction mirrors post-edit-format: file_path, then path, then ''.
test('extractFilePath prefers file_path', () =>
    assert.equal(
        extractFilePath({ tool_input: { file_path: '/a.md', path: '/b.md' } }),
        '/a.md',
    ));
test('extractFilePath falls back to path', () =>
    assert.equal(extractFilePath({ tool_input: { path: '/b.md' } }), '/b.md'));
test('extractFilePath tolerates missing tool_input', () =>
    assert.equal(extractFilePath({}), ''));
