'use strict';
// dcg decisions under this checkout's dcg policy. Renders home/dot_config/dcg into a
// temp HOME, so the live ~/.config/dcg is never read and history lands in the temp dir.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');

function renderHome(data) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dcg-policy-'));
    const dcgDir = path.join(home, '.config', 'dcg');
    fs.mkdirSync(dcgDir, { recursive: true });
    const config = execFileSync(
        'chezmoi',
        ['--source', repo, 'execute-template', '--override-data', JSON.stringify(data)],
        { input: fs.readFileSync(path.join(repo, 'home/dot_config/dcg/config.toml.tmpl')), encoding: 'utf8' },
    );
    fs.writeFileSync(path.join(dcgDir, 'config.toml'), config);
    fs.cpSync(path.join(repo, 'home/dot_config/dcg/packs'), path.join(dcgDir, 'packs'), { recursive: true });
    return home;
}

const homes = { mac: renderHome({ is_wsl: false }), wsl: renderHome({ is_wsl: true }) };
test.after(() => Object.values(homes).forEach(h => fs.rmSync(h, { recursive: true, force: true })));

// Hook mode, as Claude Code calls it: `dcg test` decides some commands differently.
function decide(host, command) {
    const home = homes[host];
    const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: home });
    const res = spawnSync('dcg', [], { input, env, cwd: home, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const out = res.stdout.trim() ? JSON.parse(res.stdout).hookSpecificOutput : {};
    return { decision: out.permissionDecision || 'allow', rule: out.ruleId };
}

const jobLog = '~/.claude/jobs/0a1b2c3d/tmp';
const macTemp = '/private/tmp/claude-501/-Users-me-proj/00000000-sess/scratchpad';
const linuxTemp = '/tmp/claude-1000/-home-me-proj/00000000-sess/scratchpad';

// From a real denial: a helper script written under the agent's temp dir, whose body
// starts a shell (`sh -c`) dcg cannot see into.
const tempScript = dir => `cat > ${dir}/ct-update.sh <<'EOF'
#!/bin/sh
# usage: ct-update.sh <id>...  — snapshot, then upgrade inside each container
for id in "$@"; do
  name=$(pct config $id | awk '/^hostname/{print $2}')
  pct snapshot $id pre-upgrade --description "before upgrade" >/dev/null 2>&1 && snap=ok || snap=FAILED
  out=$(pct exec $id -- sh -c 'export DEBIAN_FRONTEND=noninteractive; apt-get -y full-upgrade' | tr '\\n' ' ')
  echo "CT$id $name snapshot=$snap: $out"
done
EOF`;

for (const host of ['mac', 'wsl']) {
    test(`${host}: destructive commands still deny`, () => {
        for (const cmd of ['git reset --hard', 'rm -rf ~', 'git clean -fdx', 'git push --force origin main', 'echo x > ~/.bashrc'])
            assert.equal(decide(host, cmd).decision, 'deny', cmd);
    });

    test(`${host}: an allowed log path does not cover the rest of the command`, () => {
        assert.equal(decide(host, `echo x > ${jobLog}/log && git reset --hard`).rule, 'core.git:reset-hard');
        assert.equal(decide(host, `echo x > ${macTemp}/log; rm -rf ~`).decision, 'deny');
    });

    test(`${host}: test output redirected to the session job dir or agent temp dir is allowed`, () => {
        for (const dir of [jobLog, macTemp, linuxTemp])
            assert.equal(decide(host, `pnpm test > ${dir}/test.log 2>&1`).decision, 'allow', dir);
    });

    test(`${host}: a heredoc writing a script under the agent temp dir is allowed`, () => {
        for (const dir of [macTemp, linuxTemp, jobLog])
            assert.equal(decide(host, tempScript(dir)).decision, 'allow', dir);
    });

    test(`${host}: an inline launcher dcg cannot verify asks instead of denying`, () => {
        const res = decide(host, `L='for d in a b; do echo $d; done'; zsh -c "$L"`);
        assert.deepEqual(res, { decision: 'ask', rule: 'heredoc.posix:inline-launcher-unverified' });
    });
}

// A real denial: a Python heredoc then scp+ssh, which dcg's Windows filesystem pass
// reports as unverified even with no Windows command in it.
const windowsFalsePositive = fs.readFileSync(path.join(__dirname, 'fixtures/dcg-windows-semantic-false-positive.sh'), 'utf8');

test('mac: the Windows filesystem semantic check is off', () => {
    assert.equal(decide('mac', windowsFalsePositive).decision, 'allow');
});

test('wsl: the Windows filesystem semantic check stays on', () => {
    assert.equal(decide('wsl', windowsFalsePositive).rule, 'windows.filesystem:windows-filesystem-semantic-unverified');
});

// The pipe-to-tail hook's deny message hands the agent a rewritten command; dcg must let it run.
const pipeToTail = require('../home/dot_claude/hooks/bash-checks/block-pipe-to-tail');
const suggested = command => {
    const { stderr } = pipeToTail.run({ tool_input: { command }, session_id: '0a1b2c3d-4e5f-6789-abcd-ef0123456789' });
    return stderr.split('\n').find(l => l.includes('echo "exit $?"')).trim();
};

for (const host of ['mac', 'wsl']) {
    test(`${host}: the redirect the pipe-to-tail hook suggests is allowed`, () => {
        for (const cmd of ['moon run web:typecheck 2>&1 | tail -3', 'pnpm exec playwright test 2>&1 | tail -40', 'node --test tests/ 2>&1 | tail -8']) {
            const fix = suggested(cmd);
            assert.match(fix, /> \/tmp\/claude-\d+\/0a1b2c3d\.log 2>&1/);
            assert.equal(decide(host, fix).decision, 'allow', fix);
        }
    });
}
