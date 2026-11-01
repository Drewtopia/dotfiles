'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {
    decide,
    denyOnError,
    grantOnExpansion,
    isGoverned,
    markerPath,
    unlocked,
} = require('../edit-governance-guard.cjs');

const edit = file_path => ({ tool_input: { file_path } });

test('allows files outside governance paths', () => {
    assert.equal(
        decide(edit('/repo/src/index.ts'), () => false),
        null,
    );
});

test('denies a governance path without an unlock', () => {
    assert.match(
        decide(edit('/repo/.claude/skills/x/SKILL.md'), () => false),
        /Governance surface/,
    );
});

test('denies vault rules, mods and git hooks in the checkout and in a worktree', () => {
    for (const p of [
        '/home/u/.claude-vault/rules/style.md',
        '/home/u/dev/worktrees/claude-vault/rules-x/rules/style.md',
        '/home/u/.claude-vault/mods/blast-radius/hooks/register.tsx',
        '/home/u/dev/worktrees/claude-vault/mods-x/mods/pw-report/hooks/register.tsx',
        '/home/u/.claude-vault/.githooks/pre-commit',
        '/home/u/dev/worktrees/claude-vault/hooks-x/.githooks/pre-commit',
    ]) {
        assert.match(
            decide(edit(p), () => false),
            /Governance surface/,
            p,
        );
    }
});

test("governs moon's workspace tasks but not a project's moon.yml", () => {
    assert.match(decide(edit('/repo/.moon/tasks/all.yml'), () => false), /Governance surface/);
    assert.equal(decide(edit('/repo/packages/x/moon.yml'), () => false), null);
});

test('denies Azure DevOps pipeline and template files', () => {
    for (const p of [
        '/repo/.azuredevops/pipelines/pr-validation.yml',
        '/repo/.azuredevops/templates/e2e-steps.yml',
    ]) {
        assert.match(decide(edit(p), () => false), /Governance surface/, p);
    }
});

test('allows a governance path with a fresh unlock', () => {
    assert.equal(
        decide(edit('/repo/.claude/skills/x/SKILL.md'), () => true),
        null,
    );
});

test('passes the calling session to the unlock check', () => {
    const seen = [];
    decide(
        { session_id: 'abc', tool_input: { file_path: '/repo/AGENTS.md' } },
        sid => (seen.push(sid), false),
    );
    assert.deepEqual(seen, ['abc']);
});

test('governs the settings merge template and the unlock markers', () => {
    assert.ok(isGoverned('/c/home/.chezmoitemplates/claude-settings-merge'));
    assert.ok(isGoverned('/home/u/.claude/governance-unlock/session-abc'));
    assert.ok(!isGoverned('/repo/src/claude.ts'));
});

test('governs a CLAUDE_CONFIG_DIR config like ~/.claude, but not the vault itself', () => {
    assert.ok(isGoverned('/home/u/.claude-fresh/settings.json'));
    assert.ok(isGoverned('/home/u/.claude-fresh/skills/edit-governance/README.md'));
    assert.ok(isGoverned('/home/u/.claude-fresh/hooks/x.js'));
    assert.ok(!isGoverned('/home/u/.claude-fresh/projects/x/memory/notes.md'));
    assert.ok(!isGoverned('/home/u/.claude-vault/plans/lean-reset.md'));
});

test('governs mods, which load into every session like hooks', () => {
    assert.ok(isGoverned('/home/u/.claude/mods/vault-push/hooks/register.tsx'));
    assert.ok(!isGoverned('/home/u/.claude/dev-mods/abc/x/hooks/register.ts'));
});

test('rejects a session id that could escape the marker dir', () => {
    assert.equal(markerPath('../x'), null);
    assert.equal(markerPath(undefined), null);
    assert.equal(grantOnExpansion({ session_id: '../x', command_name: 'edit-governance' }), false);
});

test('only an unlocking command grants, and only its own session', () => {
    const sid = `test-${process.pid}-${Date.now()}`;
    try {
        assert.equal(grantOnExpansion({ session_id: sid, command_name: 'close' }), false);
        assert.equal(unlocked(sid), false);
        assert.equal(grantOnExpansion({ session_id: sid, command_name: 'edit-governance' }), true);
        assert.equal(unlocked(sid), true);
        assert.equal(unlocked(`${sid}-other`), false);
    } finally {
        fs.rmSync(markerPath(sid), { force: true });
    }
});

test('a crash denies instead of allowing', () => {
    const reason = denyOnError(() => {
        throw new Error('boom');
    });
    assert.match(reason, /edit-governance-guard errored: boom/);
});

// Real denials: agents drafting governed files in a scratchpad under the temp directory.
test('allows scratch copies in an existing directory under the temp directory', () => {
    const dir = fs.mkdtempSync(`${require('node:os').tmpdir()}/gov-`);
    try {
        for (const rel of [
            'scratchpad/prompt-audit/b/AGENTS.md',
            'scratchpad/ask-u/SKILL.md',
            'scratchpad/gov/repo/docs/adr/0047-x.md',
            'draft/.github/workflows/ci.yml',
        ]) {
            const p = `${dir}/${rel}`;
            fs.mkdirSync(require('node:path').dirname(p), { recursive: true });
            assert.equal(decide(edit(p), () => false), null, p);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// A missing parent could be made a symlink to live config before the write lands.
test('a temp path whose parent directory does not exist yet stays governed', () => {
    const dir = fs.mkdtempSync(`${require('node:os').tmpdir()}/gov-`);
    try {
        assert.match(decide(edit(`${dir}/x/.claude/hooks/a.js`), () => false), /Governance surface/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a path that only climbs out of the temp directory stays governed', () => {
    assert.match(decide(edit('/tmp/../home/u/.claude/hooks/x.js'), () => false), /Governance surface/);
});

// Agents read "ask the user to run /edit-governance" as leave to run it themselves.
test('the denial says only Drew can run /edit-governance, and to stop and ask him', () => {
    const reason = decide(edit('/repo/AGENTS.md'), () => false);
    assert.match(reason, /Only Drew can run \/edit-governance/);
    assert.match(reason, /agents can't invoke it/i);
    assert.match(reason, /Stop and ask (him|Drew)/);
});

test('a symlink from the temp directory to live config stays governed', () => {
    const dir = fs.mkdtempSync(`${require('node:os').tmpdir()}/gov-`);
    try {
        fs.symlinkSync('/', `${dir}/root`);
        assert.match(decide(edit(`${dir}/root/home/u/.claude/hooks/x.js`), () => false), /Governance surface/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
