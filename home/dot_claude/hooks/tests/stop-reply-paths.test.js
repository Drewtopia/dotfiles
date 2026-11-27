'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { relativePaths, missingPaths, bareRefs, lastAssistantText, isT3 } = require('../stop-reply-paths.js');

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

// Copied from replies Drew pushed back on, 23-24 Nov.
const bare = [
    ['Azure PR', 'PR 11191 is ready to complete', ['PR 11191']],
    ['PR list', 'PRs 10901, 10752 and 10591 are mid-merge', ['PRs 10901, 10752 and 10591']],
    ['Azure bang', 'Open PRs: !11282 and !11275', ['!11282', '!11275']],
    ['GitHub issue', 'close #1225 and #1148', ['#1225', '#1148']],
    ['repo issue', 'keep GH-1857, close hub#42?', ['GH-1857', 'hub#42']],
    ['work item', 'bug 65781 and story 59805', ['bug 65781', 'story 59805']],
    ['build and run', 'build 50169 is green; runs 48218 and 48219', ['build 50169', 'runs 48218 and 48219']],
    ['pipeline', 'pipeline 703 publishes', ['pipeline 703']],
    ['commit', 'fixed in commit `ef87d744d`', ['commit `ef87d744d']],
    ['code style', 'see `PR 11176`', ['PR 11176']],
    ['27 Nov reply', 'PR checks are running for 11370 as build 50810', ['build 50810']],
    ['only one linked', '[PR 11370](https://x/pullrequest/11370) runs as build 50810', ['build 50810']],
    ['list half linked', '[PR 10901](https://x/10901) waits; PRs 10901 and 10752 too', ['PRs 10901 and 10752']],
    ['number only in a label', '[PR 42](https://x.io/foo) and PR 42', ['PR 42']],
    ['number mid-URL', 'see https://x.io/2026/11/27/post. PR 2026 is open', ['PR 2026']],
    ['other hash, same prefix', 'https://x/commit/1234567abcd then commit 1234567ffff', ['commit 1234567ffff']],
];
const linked = [
    ['link', '[PR 11191](https://dev.azure.com/o/p/_git/r/pullrequest/11191) is ready'],
    ['link list', 'drafts: [11176](https://x/11176), [11180](https://x/11180)'],
    ['url', 'see https://github.com/Drewtopia/hub/pull/79'],
    ['fenced', '```sh\naz repos pr update --id 11191 --status completed\n```'],
    ['small numbers', 'step 4 of 5, item 2, PR 7 lines, #1 priority'],
    ['heading', '## Step 3'],
    ['html entity', 'got `O&#39;Conner`'],
    ['issues-log row', 'see row #71 in the issues log'],
    ['command flag', 'run `gh pr view 79 -R o/r`'],
    ['empty', ''],
    ['linked earlier', '[PR 11319](https://x/pullrequest/11319) is green. Merge PR 11319 when ready'],
    ['linked by url', 'https://dev.azure.com/o/p/_build/results?buildId=50810 runs; build 50810 takes 25 min'],
];
for (const [name, text, want] of bare) test(`bare ref: ${name}`, () => assert.deepEqual(bareRefs(text), want));
for (const [name, text] of linked) test(`linked or not a ref: ${name}`, () => assert.deepEqual(bareRefs(text), []));

test('blocks a T3 reply with a bare PR number and says how to link it', () => {
    const r = run({ last_assistant_message: 'complete PR 11191' }, { CLAUDE_CODE_ENTRYPOINT: 't3-code' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /PR 11191/);
    assert.match(r.stderr, /pullrequest/);
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
