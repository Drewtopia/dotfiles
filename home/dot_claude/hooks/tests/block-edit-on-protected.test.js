'use strict';
/** Safety net for warn-edit-on-protected.js — pure warningFor(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { warningFor } = require('../warn-edit-on-protected');

// Protected branches produce a warning naming the branch.
for (const branch of ['main', 'master', 'develop']) {
    test(`warns on ${branch}`, () => {
        const msg = warningFor(branch);
        assert.match(msg, /protected branch/);
        assert.match(msg, new RegExp(branch));
    });
}

// Feature branches and unknown branches stay silent.
for (const branch of ['feat/login', 'fix/x', 'release/1.2', '', undefined]) {
    test(`silent on ${JSON.stringify(branch)}`, () =>
        assert.equal(warningFor(branch), ''));
}
