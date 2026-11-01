'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

test('blocks mise local configs, which hold plaintext env secrets', () => {
    for (const filePath of ['mise.local.toml', '/home/u/.config/mise/config.local.toml']) {
        assert.equal(guard.run(fileInput('Read', filePath)).exitCode, 2, `${filePath} should block`);
    }
    const grep = guard.run(cmdInput('Bash', 'grep -n AZURE_TOKEN ~/.config/mise/config.local.toml'));
    assert.equal(grep.exitCode, 2);
    assert.equal(guard.run(cmdInput('Bash', 'rg -l AZURE_TOKEN ~/.config')).exitCode, 0);
});

test('blocks sensitive extensions', () => {
    for (const ext of ['.pem', '.key', '.p12', '.pfx']) {
        const res = guard.run(fileInput('Edit', `certs/server${ext}`));
        assert.equal(res.exitCode, 2, `${ext} should block`);
        assert.match(res.stderr, /private keys or certificates/);
    }
});

test('blocks sensitive path substrings', () => {
    const cases = [
        ['lib/credential-store.ts', 'credential'],
        ['keys/private_key.txt', 'private_key'],
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

test('secret-named data files still block', () => {
    for (const p of [
        'Downloads/client_secret_123.apps.googleusercontent.com.json',
        'app/.secret',
        'k8s/db-secret.yaml',
        'keys/jwt-secret.txt',
    ]) {
        assert.equal(guard.run(fileInput('Read', p)).exitCode, 2, p);
    }
});

test('multi-part names match as path endings', () => {
    for (const p of [
        'repo/.git/config',
        '/Users/x/.aws/credentials',
        '/Users/x/.docker/config.json',
    ]) {
        const res = guard.run(fileInput('Read', p));
        assert.equal(res.exitCode, 2, p);
        assert.match(res.stderr, /known sensitive file/);
    }
});

test('env templates stay readable', () => {
    for (const name of ['.env.example', '.env.sample', '.env.template']) {
        assert.equal(guard.run(fileInput('Read', `docs/${name}`)).exitCode, 0, name);
    }
});

test('public keys, known hosts, certificates and git config stay readable', () => {
    for (const p of [
        '~/.ssh/id_rsa.pub',
        '~/.ssh/id_ed25519.pub',
        '~/.ssh/known_hosts',
        '~/.ssh/authorized_keys',
        '~/.gitconfig',
        'certs/server.crt',
        'certs/ca.cer',
        'hooks/block-secrets.js',
    ]) {
        assert.equal(guard.run(fileInput('Read', p)).exitCode, 0, p);
    }
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

test('a sensitive name inside a longer word is not a file', () => {
    for (const cmd of [
        'grep -rn process.env src',
        'git commit -m "read process.env once"',
        'node -e "console.log(Object.keys(x))"',
        'cat .env.example',
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
    }
});

test('a sensitive file named as a path token still blocks', () => {
    for (const cmd of [
        'cat apps/x/.env',
        'source .env.local',
        'cp .env.production /tmp/x',
        'cat .env.custom',
        'scp host:~/.ssh/id_rsa .',
        'cat server.pem',
        'x=$(<.env)',
        'grep KEY .env;',
        'cat .env*',
        'cat {.env,README.md}',
        'cp secrets.json.bak /tmp/x',
        'cp .npmrc.bak /tmp/x',
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 2, cmd);
    }
});

test('code and data that only look like key or env files stay allowed', () => {
    for (const cmd of [
        "jq '.hooks|to_entries[]|{e:.key,n:.value}' settings.json",
        "grep -iE '\\.key$|\\.pem$' files.txt",
        "node - <<'EOF'\nconst v = tab.key === 'home' ? 'a' : 'b'\nconst e = data?.env\nEOF",
        "python3 - <<'EOF'\nrows.sort(key=lambda r: sort.key)\nEOF",
        "cat > register.ts <<'EOF'\nconst home = await $.env.get('HOME')\nEOF",
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
    }
});

test('a sensitive file named in a heredoc still blocks where the body can read it', () => {
    for (const cmd of [
        "python3 - <<'EOF'\nprint(open('.env').read())\nEOF",
        "bash <<'EOF'\ncat .env\nEOF",
        "cat <<'EOF' | sh\ncat server.key\nEOF",
        "cat .env <<'EOF'\nignored\nEOF",
        'cat > out.txt <<EOF\n$(cat .env)\nEOF',
        "node - <<'EOF'\nfs.readFileSync(`${dir}/.env`)\nEOF",
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 2, cmd);
    }
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

test('a crash blocks instead of allowing', () => {
    const res = guard.runSafely({}, () => {
        throw new Error('boom');
    });
    assert.equal(res.exitCode, 2);
    assert.match(res.stderr, /block-secrets errored: boom/);
});

// Cases below are past denials from transcripts, hosts and paths replaced.
test('listing or checking a secret file by name is allowed', () => {
    for (const cmd of [
        'ls .env*',
        'ls -la ~/.ssh/id_ed25519* 2>/dev/null; echo "---"',
        'ls -1 mise.local.toml apps/*/mise.*.local.toml',
        'git check-ignore -v .env',
        'git -C /srv/app check-ignore .env .env.local',
        'find . -type f \\( -name ".env*" -o -name "*.pem" -o -name "*.key" \\)',
        '[ -f /opt/app/.env ] || echo missing',
        "printf '.DS_Store\\n.env\\n.env.*\\n!.env.example\\n' > .gitignore",
        'git commit -m "ignore .env and id_rsa"',
        'rg -l API_TOKEN .env mise.local.toml',
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
    }
});

test('public keys are readable from the shell', () => {
    for (const cmd of [
        'cat ~/.ssh/id_ed25519.pub; ssh -o BatchMode=yes user@host whoami',
        'ssh-keygen -lf ~/.ssh/id_ed25519.pub | cut -c1-30',
        'k=$(cut -d" " -f2 .ssh/id_ed25519.pub); grep -c "$k" ~/.ssh/authorized_keys',
        'cat home/dot_ssh/id_rsa.pub.tmpl',
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
    }
});

test('.env or a key name as a jq path, sed script or grep pattern is allowed', () => {
    for (const cmd of [
        "jq '.env' ~/.claude/settings.json",
        "jq -r '.env|keys|join(\" \")' ~/.claude/settings.json",
        'jq ".env // {}" ~/.claude/settings.json',
        "jq -S 'del(.env)' ~/.claude/settings.json > \"$TMP/s.json\"",
        "journalctl -u svc | sed -E 's/machine.key=\\S+ //'",
        'rg -l x /config | grep -v -F "/config/secrets.yaml"',
    ]) {
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
    }
});

test('commands run over ssh are judged the same way', () => {
    assert.equal(guard.run(cmdInput('Bash', "ssh -o ConnectTimeout=8 host 'cd ~/app && ls .env*'")).exitCode, 0);
    assert.equal(guard.run(cmdInput('Bash', "ssh host 'cat ~/app/.env'")).exitCode, 2);
});

test('as a hook: tool-call JSON on stdin, exit 2 and a fix on stderr to deny', () => {
    const { spawnSync } = require('child_process');
    const hook = path.join(__dirname, '..', 'block-secrets.js');
    const call = command =>
        spawnSync(process.execPath, [hook], {
            input: JSON.stringify(cmdInput('Bash', command)),
            env: { ...process.env, HOOKS_DISABLED: '' },
            encoding: 'utf8',
        });
    assert.equal(call('ls .env*').status, 0);
    const denied = call('cat .env');
    assert.equal(denied.status, 2);
    assert.match(denied.stderr, /File: \.env/);
    assert.match(denied.stderr, /rg -l NAME <file>/);
    assert.match(denied.stderr, /\.env\.example/);
});

test('.npmrc is denied only when it holds a literal auth token', () => {
    const fs = require('fs');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npmrc-'));
    const write = body => fs.writeFileSync(path.join(dir, '.npmrc'), body);
    const read = { tool_name: 'Read', tool_input: { file_path: path.join(dir, '.npmrc') }, cwd: dir };
    const cat = { tool_name: 'Bash', tool_input: { command: 'cat .npmrc' }, cwd: dir };

    for (const body of [
        'registry=https://registry.example/\n',
        '//registry.example/:_authToken=${NPM_TOKEN}\n',
    ]) {
        write(body);
        assert.equal(guard.run(read).exitCode, 0, body);
        assert.equal(guard.run(cat).exitCode, 0, body);
    }
    for (const body of [
        '//registry.example/:_authToken=' + 'a1'.repeat(18) + '\n',
        '_auth=' + 'Zm9v'.repeat(6) + '\n',
    ]) {
        write(body);
        for (const input of [read, cat]) {
            const res = guard.run(input);
            assert.equal(res.exitCode, 2, body);
            assert.match(res.stderr, /auth token/);
            assert.match(res.stderr, /npm config list/);
        }
    }
    fs.rmSync(dir, { recursive: true });
});

test('reading a secret file through any reader still blocks', () => {
    for (const cmd of [
        'ls .env && cat .env',
        'echo "$(cat .env)"',
        'head < .env',
        'jq . .env.json',
        'sed -n 1p .env',
        'grep -v x .env',
        'git diff -- .env',
        'git show HEAD:.env',
        'find . -name .env -exec cat {} \\;',
        "bash -c 'cat .env'",
        'cat ~/.ssh/id_ed25519',
        'ls .env* | xargs cat',
        'find . -name .env -print0 | xargs -0 head',
    ]) {
        const res = guard.run(cmdInput('Bash', cmd));
        assert.equal(res.exitCode, 2, cmd);
        assert.match(res.stderr, /SECURITY HOOK BLOCKED/);
    }
});

test('a program behind npx or stdbuf is judged as itself', () => {
    for (const cmd of ['npx rg -l API_TOKEN .env', 'stdbuf -oL ls .env'])
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
});

test('a command that builds its words at run time is judged by every name in it', () => {
    for (const cmd of [
        'cat $(echo .env)',
        'cat `echo .env`',
        "bash -c 'f=.env; cat $f'",
        'f=.env; eval "cat $f"',
        'f=.env; cat "$f"',
        'v=f; f=.env; cat "${!v}"',
    ])
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 2, cmd);
});

test('PowerShell is judged by every name in it, since type and gc read files', () => {
    for (const cmd of ['type .env', 'gc .env', 'Get-Content -Path .env'])
        assert.equal(guard.run(cmdInput('PowerShell', cmd)).exitCode, 2, cmd);
});

test('a runner flag value or an unclear mise exec is not taken for a name-only program', () => {
    for (const cmd of [
        "mise x -c 'cat .env'",
        'mise exec node cat .env',
        'sudo -u echo cat .env',
        'timeout -s ls 5 cat .env',
        'npx -p ls cat .env',
        'env -u ls cat .env',
    ])
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 2, cmd);
});

test('only a flag that hides matching lines, for that tool, makes a grep name-only', () => {
    for (const cmd of ['rg -L KEY .env', 'grep -e -l .env', 'rg -e -c .env', 'grep --regexp -q .env', 'rg -iL KEY .env'])
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 2, cmd);
    for (const cmd of [
        'grep -c KEY .env',
        'grep -rL KEY .env',
        'grep -iq KEY .env',
        'rg --count KEY .env',
        'rg -q KEY .env',
        'rg --files-with-matches KEY .env',
        'egrep -l KEY .env',
    ])
        assert.equal(guard.run(cmdInput('Bash', cmd)).exitCode, 0, cmd);
});
