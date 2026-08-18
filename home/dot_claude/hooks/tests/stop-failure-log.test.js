'use strict';
/** Safety net for stop-failure-log.js — pure formatFailureLine(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { formatFailureLine } = require('../stop-failure-log');

const NOW = '2026-01-02T03:04:05.000Z';

test('full payload -> tab-separated line', () => {
    const line = formatFailureLine(
        {
            session_id: 'abc123',
            error_type: 'rate_limit',
            error_message: 'Rate limit exceeded',
        },
        NOW,
    );
    assert.equal(line, [NOW, 'abc123', 'rate_limit', 'Rate limit exceeded'].join('\t'));
});

test('missing error_type defaults to unknown; missing fields placeholdered', () => {
    const line = formatFailureLine({}, NOW);
    assert.equal(line, [NOW, '-', 'unknown', '-'].join('\t'));
    assert.doesNotThrow(() => formatFailureLine(undefined, NOW));
});

test('multiline error_message is flattened and capped', () => {
    const line = formatFailureLine(
        { error_type: 'server_error', error_message: 'a\nb\n'.repeat(300) },
        NOW,
    );
    const msg = line.split('\t')[3];
    assert.ok(msg.length <= 300);
    assert.ok(!msg.includes('\n'));
});
