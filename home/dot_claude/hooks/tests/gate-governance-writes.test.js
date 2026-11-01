'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const { run } = require('../bash-checks/gate-governance-writes');

const code = (command, isUnlocked = () => false) =>
    run({ session_id: 's1', cwd: '/repo', tool_input: { command } }, isUnlocked).exitCode;

const WRITES = [
    "sed -i '1s|a|b|' .moon/tasks/all.yml",
    'cat > ~/.claude-vault/rules/style.md <<EOF',
    "printf '\\n' >> .claude/skills/x/SKILL.md",
    'echo x | tee -a AGENTS.md',
    'cp /tmp/SKILL.md .claude/skills/x/SKILL.md',
    'cd docs/adr && rm 0001-x.md',
    'perl -pi -e s/a/b/ CLAUDE.md',
    'touch ~/.claude/governance-unlock/session-s1',
    'mv /tmp/x .github/workflows/ci.yml',
    `echo '{"session_id":"s1","command_name":"edit-governance"}' | node ~/.claude/hooks/edit-governance-guard.cjs --expansion`,
    "sh -c 'echo x >> AGENTS.md'",
    'cd "docs/adr" && rm 0001-x.md',
];

const READS = [
    'cat .claude/skills/x/SKILL.md',
    'cp .claude/skills/x/SKILL.md /tmp/copy.md',
    'sed -n 1,20p AGENTS.md',
    'grep -rn foo docs/adr > /tmp/out.txt',
    'echo "a > AGENTS.md"',
    'node ~/.claude/hooks/edit-governance-guard.cjs --lock 2>/dev/null',
    'rm -rf node_modules',
];

for (const cmd of WRITES) test(`blocks: ${cmd}`, () => assert.equal(code(cmd), 2));
for (const cmd of READS) test(`allows: ${cmd}`, () => assert.equal(code(cmd), 0));

test('allows a governed write in an unlocked session', () => {
    const seen = [];
    assert.equal(
        code('sed -i s/a/b/ AGENTS.md', sid => (seen.push(sid), true)),
        0,
    );
    assert.deepEqual(seen, ['s1']);
});

test('names the governed path in the block message', () => {
    const res = run(
        { cwd: os.homedir(), tool_input: { command: 'echo >> CLAUDE.md' } },
        () => false,
    );
    assert.match(res.stderr, /CLAUDE\.md.*\/edit-governance/);
});

// Real denial: copying a skill into the session scratchpad to draft it there.
test('allows a governed-looking write under the temp directory', () => {
    assert.equal(
        code('cp ~/.claude-vault/skills/standup/SKILL.md /private/tmp/claude-501/-Users-u-proj/sess-1/scratchpad/SKILL.md'),
        0,
    );
    assert.equal(
        code("cd /private/tmp/claude-501/-Users-u-proj/sess-1/scratchpad/audit; ssh host 'cat ~/.claude/skills/x/SKILL.md' > src/x/SKILL.md"),
        0,
    );
});

test('the Bash block message says only Drew can run /edit-governance', () => {
    const res = run({ cwd: '/repo', tool_input: { command: 'echo >> AGENTS.md' } }, () => false);
    assert.match(res.stderr, /Only Drew can run \/edit-governance/);
    assert.match(res.stderr, /Stop and ask (him|Drew)/);
});

test('a temp path is not exempt when the same command creates links', () => {
    for (const cmd of [
        'ln -s ~/.claude /tmp/d/.claude && echo x > /tmp/d/.claude/hooks/a.js',
        'cp -s ~/.claude/hooks/a.js /tmp/d/.claude/hooks/a.js; echo x >> /tmp/d/.claude/hooks/a.js',
    ])
        assert.equal(code(cmd), 2, cmd);
});
