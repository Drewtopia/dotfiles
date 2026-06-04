'use strict';
/**
 * Parity tests for block-secrets.js (port of block-secrets.py).
 * Every SECRET_TOKEN_PATTERN provider and each file-block path is exercised.
 * Run: node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../block-secrets.js');

const fileInput = (toolName, filePath) => ({
    tool_name: toolName,
    tool_input: { file_path: filePath },
});
const cmdInput = (toolName, command) => ({
    tool_name: toolName,
    tool_input: { command },
});

test('allows ordinary file edits', () => {
    assert.equal(guard.run(fileInput('Edit', 'src/index.ts')).exitCode, 0);
    assert.equal(guard.run(fileInput('Read', 'README.md')).exitCode, 0);
});

test('allows ordinary shell commands', () => {
    assert.equal(guard.run(cmdInput('Bash', 'git status')).exitCode, 0);
    assert.equal(
        guard.run(cmdInput('PowerShell', 'Get-ChildItem')).exitCode,
        0,
    );
});

test('blocks known sensitive filenames', () => {
    for (const name of ['.env', 'id_rsa', 'secrets.json', '.npmrc']) {
        const res = guard.run(fileInput('Read', `some/dir/${name}`));
        assert.equal(res.exitCode, 2, `${name} should block`);
        assert.match(res.stderr, /SECURITY HOOK BLOCKED/);
        assert.match(res.stderr, /known sensitive file/);
    }
});

test('blocks sensitive extensions', () => {
    for (const ext of ['.pem', '.key', '.p12', '.crt']) {
        const res = guard.run(fileInput('Edit', `certs/server${ext}`));
        assert.equal(res.exitCode, 2, `${ext} should block`);
        assert.match(res.stderr, /private keys or certificates/);
    }
});

test('blocks sensitive path substrings', () => {
    const cases = [
        ['app/my-secret-config.ts', 'secret'],
        ['lib/credential-store.ts', 'credential'],
        ['keys/private_key.txt', 'private_key'],
        // '/secrets/' is unreachable as a distinct reason — 'secret' (earlier in
        // the list) always matches first. Parity with the .py list order.
        ['config/secrets/db.yaml', 'secret'],
        ['env/.env.production-notes', '.env.'],
    ];
    for (const [filePath, pattern] of cases) {
        const res = guard.run(fileInput('Read', filePath));
        assert.equal(res.exitCode, 2, `${filePath} should block`);
        assert.match(
            res.stderr,
            new RegExp(
                `sensitive pattern '${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
            ),
        );
    }
});

test('.env.example is blocked via .env. pattern (py parity quirk)', () => {
    assert.equal(guard.run(fileInput('Read', 'docs/.env.example')).exitCode, 2);
});

test('blocks every provider token shape in a command', () => {
    const tokens = {
        'AWS access key': 'AKIA1234567890ABCDEF',
        'GitHub token': 'ghp_' + 'a'.repeat(36),
        'Anthropic API key': 'sk-ant-' + 'a'.repeat(20),
        'OpenAI API key': 'sk-' + 'a'.repeat(48),
        'Slack token': 'xoxb-' + 'a'.repeat(20),
        'Google API key': 'AIza' + 'a'.repeat(35),
        'Stripe key': 'sk_live_' + 'a'.repeat(24),
    };
    for (const [provider, token] of Object.entries(tokens)) {
        const res = guard.run(
            cmdInput('Bash', `curl -H "auth: ${token}" https://x`),
        );
        assert.equal(res.exitCode, 2, `${provider} should block`);
        assert.match(res.stderr, new RegExp(`literal ${provider} detected`));
    }
});

test('token scan also applies to PowerShell', () => {
    const res = guard.run(
        cmdInput(
            'PowerShell',
            'Invoke-RestMethod -Headers @{a="AKIA1234567890ABCDEF"}',
        ),
    );
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /AWS access key/);
});

test('command referencing a sensitive filename falls through to file block', () => {
    const res = guard.run(cmdInput('Bash', 'cat .env'));
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /SECURITY HOOK BLOCKED/);
});

test('unit: secretInCommand returns first provider only', () => {
    assert.deepEqual(guard.secretInCommand('no tokens here'), {
        matched: false,
        provider: '',
    });
    assert.equal(
        guard.secretInCommand('AKIA1234567890ABCDEF').provider,
        'AWS access key',
    );
});

test('unit: extractFilePath honours key order and command fallback', () => {
    assert.equal(
        guard.extractFilePath({ tool_input: { file_path: 'a', path: 'b' } }),
        'a',
    );
    assert.equal(guard.extractFilePath({ tool_input: { path: 'b' } }), 'b');
    assert.equal(
        guard.extractFilePath({ tool_input: { command: 'vim notes.txt' } }),
        '',
    );
    assert.equal(guard.extractFilePath({ tool_input: {} }), '');
});

test('empty / malformed input is allowed (fail-open parity)', () => {
    assert.equal(guard.run({}).exitCode, 0);
    assert.equal(guard.run({ tool_name: 'Read', tool_input: {} }).exitCode, 0);
    assert.equal(
        guard.run({ tool_name: 'Read', tool_input: { file_path: '' } })
            .exitCode,
        0,
    );
});
