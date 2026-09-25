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
