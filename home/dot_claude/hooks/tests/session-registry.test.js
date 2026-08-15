'use strict';
/** Tests for session-registry.cjs buildWarning (pure decision). Run: node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWarning } = require('../session-registry.cjs');

const rel = 'apps/disclosures/src/api/accounts.ts';
const relDir = 'apps/disclosures/src/api';

test('no other sessions → no warning', () => {
    assert.equal(buildWarning({ rel, relDir, areaOk: true, others: [] }), null);
});

test('another session on the exact file → LIVE COLLISION naming it', () => {
    const w = buildWarning({
        rel,
        relDir,
        areaOk: true,
        others: [{ label: 'BBBB2222 (develop)', files: [rel] }],
    });
    assert.match(w, /LIVE COLLISION/);
    assert.match(w, /BBBB2222 \(develop\)/);
});

test('another session in the same dir (different file) → NEARBY, not collision', () => {
    const w = buildWarning({
        rel,
        relDir,
        areaOk: true,
        others: [{ label: 'CCCC3333 (feature/x)', files: [`${relDir}/other.ts`] }],
    });
    assert.match(w, /LIVE NEARBY WORK/);
    assert.match(w, /other\.ts/);
});

test('exact collision beats area overlap when both present', () => {
    const w = buildWarning({
        rel,
        relDir,
        areaOk: true,
        others: [{ label: 'BBBB2222 (develop)', files: [rel, `${relDir}/other.ts`] }],
    });
    assert.match(w, /LIVE COLLISION/);
    assert.doesNotMatch(w, /NEARBY/);
});

test('area check suppressed when areaOk is false (top-level dir)', () => {
    const w = buildWarning({
        rel: 'README.md',
        relDir: '.',
        areaOk: false,
        others: [{ label: 'BBBB2222 (develop)', files: ['LICENSE'] }],
    });
    assert.equal(w, null);
});

test('a session touching an unrelated file → no warning', () => {
    const w = buildWarning({
        rel,
        relDir,
        areaOk: true,
        others: [{ label: 'BBBB2222 (develop)', files: ['apps/ems/src/cli.ts'] }],
    });
    assert.equal(w, null);
});
