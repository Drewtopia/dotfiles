'use strict';
/** Safety net for user-prompt-drift-check.js — the commit checkpoint's pure helpers. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    parseShortstat,
    oldestChangeMinutes,
    checkpointNotice,
    CHECKPOINT_LINES,
    CHECKPOINT_MINUTES,
} = require('../user-prompt-drift-check');

const SHORTSTATS = [
    [' 3 files changed, 10 insertions(+), 2 deletions(-)', 12],
    [' 1 file changed, 1 insertion(+)', 1],
    [' 1 file changed, 4 deletions(-)', 4],
    ['', 0],
    [undefined, 0],
];
for (const [text, lines] of SHORTSTATS) {
    test(`parseShortstat ${JSON.stringify(text)} → ${lines}`, () =>
        assert.equal(parseShortstat(text), lines));
}

test('checkpoint stays silent below both thresholds', () =>
    assert.equal(checkpointNotice({ lines: CHECKPOINT_LINES - 1, minutes: CHECKPOINT_MINUTES - 1 }), ''));

test('checkpoint fires on a large diff', () =>
    assert.match(checkpointNotice({ lines: CHECKPOINT_LINES, minutes: 0 }), /200 uncommitted lines/));

test('checkpoint fires on an old change', () =>
    assert.match(checkpointNotice({ lines: 5, minutes: CHECKPOINT_MINUTES }), /45 min old/));

test('oldestChangeMinutes reads the oldest mtime and skips deleted files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
    try {
        const now = Date.now();
        fs.writeFileSync(path.join(root, 'old.js'), '');
        fs.writeFileSync(path.join(root, 'new.js'), '');
        fs.utimesSync(path.join(root, 'old.js'), new Date(now - 90 * 60000), new Date(now - 90 * 60000));
        assert.equal(oldestChangeMinutes(root, ['new.js', 'old.js', 'gone.js'], now), 90);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('oldestChangeMinutes is 0 when no file can be read', () =>
    assert.equal(oldestChangeMinutes('/nonexistent', ['a.js'], Date.now()), 0));
