'use strict';
/** Safety net for session-start-window-name.js — pure windowName(). */

const { test } = require('node:test');
const assert = require('node:assert');
const { windowName } = require('../session-start-window-name');

test('dir + session id -> cc:<dir>·<id4>', () => {
    assert.equal(
        windowName('/a/b/chezmoi', 'a1b2c3d4-e5f6-7890'),
        'cc:chezmoi·a1b2',
    );
});

test('two ids in the same dir stay distinct', () => {
    const a = windowName('/w/repo', 'aaaa1111');
    const b = windowName('/w/repo', 'bbbb2222');
    assert.notEqual(a, b);
    assert.equal(a, 'cc:repo·aaaa');
    assert.equal(b, 'cc:repo·bbbb');
});

test('missing session id -> plain cc:<dir>', () => {
    assert.equal(windowName('/a/b/chezmoi', ''), 'cc:chezmoi');
    assert.equal(windowName('/a/b/chezmoi', undefined), 'cc:chezmoi');
});

test('missing dir falls back to session', () => {
    assert.equal(windowName('', 'abcd1234'), 'cc:session·abcd');
    assert.equal(windowName(undefined, undefined), 'cc:session');
});

test('id is sanitised to alphanumerics before slicing', () => {
    // leading dashes/braces are stripped, then the first 4 alnum taken
    assert.equal(windowName('/r', '--{}zzzz9999'), 'cc:r·zzzz');
});
