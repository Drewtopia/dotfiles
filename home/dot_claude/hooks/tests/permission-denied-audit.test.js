'use strict';
/** Safety net for permission-denied-audit.js — pure formatAuditLine(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { formatAuditLine } = require('../permission-denied-audit');

const NOW = '2026-01-02T03:04:05.000Z';

test('full payload -> tab-separated line with all fields', () => {
    const line = formatAuditLine(
        {
            session_id: 'abc123',
            tool_name: 'Bash',
            decision_reason: 'Destructive command blocked',
            tool_input: { command: 'rm -rf /' },
        },
        NOW,
    );
    const cols = line.split('\t');
    assert.equal(cols[0], NOW);
    assert.equal(cols[1], 'abc123');
    assert.equal(cols[2], 'Bash');
    assert.match(cols[3], /Destructive command blocked/);
    assert.match(cols[4], /rm -rf \//);
    assert.equal(cols.length, 5);
});

test('missing fields collapse to placeholders, never throws', () => {
    const line = formatAuditLine({}, NOW);
    assert.equal(line, [NOW, '-', '-', '-', '-'].join('\t'));
    assert.doesNotThrow(() => formatAuditLine(undefined, NOW));
    assert.doesNotThrow(() => formatAuditLine(null, NOW));
});

test('long tool_input is truncated and newlines flattened', () => {
    const line = formatAuditLine(
        { tool_input: 'x\n'.repeat(500) },
        NOW,
    );
    const input = line.split('\t')[4];
    assert.ok(input.length <= 200, `input len ${input.length}`);
    assert.ok(!input.includes('\n'));
});
