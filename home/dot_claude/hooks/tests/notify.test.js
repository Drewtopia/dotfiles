'use strict';
/** Tests for notify.js (port of notify.sh). Run: node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const notify = require('../notify.js');

test('defaults when no content provided', () => {
    assert.equal(notify.parseContent({}), 'Claude needs your attention');
    assert.equal(
        notify.parseContent({ content: '' }),
        'Claude needs your attention',
    );
});

test('passes short content through unchanged', () => {
    assert.equal(notify.parseContent({ content: 'build done' }), 'build done');
});

test('truncates content over 100 chars with ellipsis', () => {
    const long = 'x'.repeat(150);
    const got = notify.parseContent({ content: long });
    assert.equal(got.length, 103);
    assert.ok(got.endsWith('...'));
    assert.equal(got.slice(0, 100), 'x'.repeat(100));
});

test('content at exactly 100 chars is not truncated', () => {
    const exact = 'y'.repeat(100);
    assert.equal(notify.parseContent({ content: exact }), exact);
});
