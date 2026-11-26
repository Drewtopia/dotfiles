'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { relativePaths, missingPaths, lastAssistantText, isT3 } = require('../stop-reply-paths.js');

const HOOK = path.join(__dirname, '..', 'stop-reply-paths.js');

const flagged = [
    ['code-style relative path', 'paste `packages/work_day_check.yaml` here', ['packages/work_day_check.yaml']],
    ['bare relative path with line', 'see src/auth.ts:42 for it', ['src/auth.ts:42']],
    ['dot-relative path', 'run `./scripts/build.sh`', ['./scripts/build.sh']],
    ['dot-folder path', 'edit .claude/rules/x.md', ['.claude/rules/x.md']],
    ['relative link target', 'open [the rule](rules/t3-replies.md)', ['rules/t3-replies.md']],
    ['repeat listed once', '`a/b.ts` and `a/b.ts`', ['a/b.ts']],
];

const clean = [
    ['absolute link', '[spec](/home/andrewcl/dev/x.spec.ts:42)'],
    ['absolute path in prose', 'it lives at /Users/drew/repos/drew/hub/rules/t3-replies.md'],
    ['home path', 'look in ~/.claude/hooks/stop-verify.js'],
    ['url', 'read https://code.claude.com/docs/en/hooks.html'],
    ['schemeless domain', 'see github.com/Drewtopia/hub.git'],
    ['thread link', '[thread](t3-thread://v2/abc/def)'],
    ['angle-bracket link target', '[thread](<t3-thread://v2/abc/mcp:launch:1d72>)'],
    ['branch name', 'branch `feat/stop-reply-paths` is pushed'],
    ['version-like', 'release/v1.2 and 3/4.5'],
    ['bare filename', 'paste `work_day_check.yaml` from HA'],
    ['slash command', 'run `/edit-governance`'],
    ['fenced block', 'Paste this:\n```text\nsee packages/work_day_check.yaml\n```\ndone'],
    ['empty', ''],
];

for (const [name, text, want] of flagged)
    test(`flags: ${name}`, () => assert.deepEqual(relativePaths(text), want));

for (const [name, text] of clean) test(`passes: ${name}`, () => assert.deepEqual(relativePaths(text), []));

test('link text is a label when the target is absolute', () => {
    assert.deepEqual(relativePaths('[src/auth.ts](/Users/drew/x/src/auth.ts:42)'), []);
});

// A folder holding src/auth.ts; the repo also tracks pkg/lib/util.ts.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-paths-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
fs.mkdirSync(path.join(dir, 'src'));
fs.writeFileSync(path.join(dir, 'src', 'auth.ts'), '');
const here = text => missingPaths(text, [dir], ['pkg/lib/util.ts']);

test('a path that exists, or ends a tracked file, passes', () => {
    assert.deepEqual(here('see `src/auth.ts:42` and `./src/auth.ts`'), []);
    assert.deepEqual(here('see `lib/util.ts`'), []);
});

test('a path that is not here is flagged', () => {
    assert.deepEqual(here('paste `packages/work_day_check.yaml`'), ['packages/work_day_check.yaml']);
});

const notFiles = [
    ['git range', 'run git log origin/main..HEAD'],
    ['repo slug', 'clone Drewtopia/dotfiles.git'],
    ['number', 'about 3/4.5x faster'],
    ['npm package', 'install @total-typescript/shoehorn.js'],
    ['words', 'a read/write.lock and/or.else'],
];
for (const [name, text] of notFiles) test(`not a file, not flagged: ${name}`, () => assert.deepEqual(here(text), []));

test('lets a T3 reply with a bare tracker number stop', () => {
    const r = run({ last_assistant_message: 'complete PR 11191 and close #1225' }, { CLAUDE_CODE_ENTRYPOINT: 't3-code' });
    assert.equal(r.status, 0);
});

test('prefers last_assistant_message over the transcript', () => {
    assert.equal(lastAssistantText({ last_assistant_message: 'hi', transcript_path: '/nope' }), 'hi');
    assert.equal(lastAssistantText({ transcript_path: '/nope' }), '');
});

test('T3 is detected from the entrypoint or thread id', () => {
    assert.equal(isT3({ CLAUDE_CODE_ENTRYPOINT: 't3-code' }), true);
    assert.equal(isT3({ T3CODE_THREAD_ID: 'x' }), true);
    assert.equal(isT3({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), false);
});

const run = (input, env) =>
    spawnSync('node', [HOOK], {
        input: JSON.stringify({ cwd: dir, ...input }),
        encoding: 'utf8',
        env: { PATH: process.env.PATH, ...env },
    });

test('blocks a T3 reply with a relative path', () => {
    const r = run({ last_assistant_message: 'see `src/a.ts`' }, { CLAUDE_CODE_ENTRYPOINT: 't3-code' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /src\/a\.ts/);
});

test('lets the reply stop outside T3, on a second pass, or when disabled', () => {
    const msg = { last_assistant_message: 'see `src/a.ts`' };
    assert.equal(run(msg, {}).status, 0);
    assert.equal(run({ ...msg, stop_hook_active: true }, { CLAUDE_CODE_ENTRYPOINT: 't3-code' }).status, 0);
    assert.equal(
        run(msg, { CLAUDE_CODE_ENTRYPOINT: 't3-code', HOOKS_DISABLED: 'stop:reply-paths' }).status,
        0,
    );
});
