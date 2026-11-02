'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run, logPath } = require('../bash-checks/block-pipe-to-tail');

const SESSION = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';
const check = command => run({ tool_input: { command }, session_id: SESSION });

// Real commands from past transcripts, with project names and paths replaced.
const DENIED = [
    'moon run web:typecheck 2>&1 | tail -3',
    'moon run web:format-check e2e:format-check 2>&1 | tail -2',
    'moon run api:build 2>&1 | tail -3',
    'moon ci 2>&1 | tail -20',
    'moon :test 2>&1 | tail -30',
    'cd apps/web && npx playwright test -c playwright.config.ts 2>&1 | tail -15',
    'pnpm exec playwright test tests/smoke.spec.ts --project=chromium 2>&1 | tail -40',
    'pnpm test 2>&1 | tail -20',
    'pnpm --filter web typecheck 2>&1 | tail -5',
    'npm run build 2>&1 | head -50',
    'yarn lint | tail',
    'node --test home/dot_claude/hooks/tests/ 2>&1 | tail -8',
    "node --test tests/ 2>&1 | grep -E '✖|ℹ (pass|fail)' | head -8",
    'tsc --noEmit -p . 2>&1 | tail -5; echo tsc=$?',
    'npx -y tsc --noEmit -p . 2>&1 | tail -5',
    'tsc -p $D 2>&1 | head; claude plugin test $D',
    'timeout 600 uv run pytest -q 2>&1 | tail -15',
    'cargo test 2>&1 | tail -30',
    'go test ./... 2>&1 | tail',
    'make check 2>&1 | tail -20',
    "git commit -q -F - <<EOF 2>&1 | tail -8\nfix(e2e): wait for the table\n\nOne | two | tail\nEOF",
];

const ALLOWED = [
    'git log --oneline | head -5',
    'ls | head',
    'tail -f /var/log/app.log',
    'cat notes.md | head -30',
    "rg -n 'pnpm test' docs | head -20",
    'git commit -q --amend --no-edit && git show --stat --oneline HEAD | head -6',
    'git commit -q --no-edit && git log --oneline -1 && git status --short | head',
    "mise ls npm:some-cli 2>&1 | tail -2",
    "pnpm exec playwright test --list --project='*' 2>&1 | tail -2",
    "grep -rn 'node --test' package.json | head",
    'pnpm list --depth 0 | head',
    'pnpm test > /tmp/claude-501/0a1b2c3d.log 2>&1; tail -n 40 /tmp/claude-501/0a1b2c3d.log',
    "cat > notes.md <<'EOF'\nRun pnpm test | tail to see the summary.\nEOF",
];

test('blocks test, build and commit commands piped to tail or head', () => {
    for (const cmd of DENIED) assert.equal(check(cmd).exitCode, 2, cmd);
});

test('allows other pipes to tail or head', () => {
    for (const cmd of ALLOWED) assert.equal(check(cmd).exitCode, 0, cmd);
});

test('the message gives a redirect to a log under the agent temp dir, then says to read it', () => {
    const { stderr } = check('cd apps/web && pnpm test 2>&1 | tail -20');
    const log = logPath(SESSION);
    assert.match(log, /^\/tmp\/claude-\d+\/0a1b2c3d\.log$/);
    assert.ok(stderr.includes(`pnpm test > ${log} 2>&1; echo "exit $?"`), stderr);
    assert.match(stderr, new RegExp(`read ${log.replace(/[.]/g, '\\.')}`, 'i'));
});

test('a heredoc command gets the redirect but no rewritten command', () => {
    const { stderr } = check("git commit -F - <<EOF 2>&1 | tail -8\nmsg\nEOF");
    assert.ok(stderr.includes(`> ${logPath(SESSION)} 2>&1`), stderr);
    assert.ok(!stderr.includes('<<'), stderr);
});

test('a test behind sudo or xargs is still a test', () => {
    for (const cmd of ['sudo pnpm test 2>&1 | tail', 'git ls-files | xargs eslint | tail -5'])
        assert.equal(check(cmd).exitCode, 2, cmd);
});
