'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hasRemote } = require('../lib/git');

test('hasRemote: false only when git confirms no remote; an error counts as having one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-remote-'));
    try {
        execFileSync('git', ['init', '-q', dir]);
        assert.equal(hasRemote(dir), false);
        execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://example.invalid/r.git']);
        assert.equal(hasRemote(dir), true);
        assert.equal(hasRemote(path.join(dir, 'missing')), true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
