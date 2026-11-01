'use strict';

// Drives the real hook against a throwaway repo with the real gitleaks. Only the network and
// secret boundaries are stubbed: `gh` (repo visibility) and `fnox` (private names).
// Leak samples are assembled at run time so this public file never holds one literally.

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'executable_git-commit-precheck.sh');

const ip = (...octets) => octets.join('.');
const sample = {
    privateIp10: `server = ${ip(10, 20, 30, 41)}`,
    privateIp172: `gateway: ${ip(172, 22, 1, 1)}`,
    privateIp192: `nas at ${ip(192, 168, 50, 7)}`,
    cgnat: `node ${ip(100, 101, 0, 9)} on the tailnet`,
    tsNet: `ssh box.${'tail1234'}.${'ts'}.net`,
    headscale: `ssh nas.${'example-home'}.${'test'}`,
    employer: `ported from the ${'Acmecorp'} pipeline`,
    foreignIssue: `see ${'some-org'}/${'tool'}#${123}`,
};
// Values the stub fnox returns, standing in for the untracked real names.
const PRIVATE = { WORK_EMPLOYER: 'Acmecorp', TAILNET_BASE_DOMAIN: 'example-home.test' };

/**
 * Runs the hook for `git commit -m <message>` in a fresh repo whose origin is GitHub and
 * whose staged file holds `content`. `visibility` is what `gh` answers ('fail' = offline).
 */
function precheck({
    content,
    visibility = 'PUBLIC',
    message = 'chore: update',
    remote,
    names = PRIVATE,
    cached,
    command,
    files = {},
}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precheck-'));
    const repo = path.join(tmp, 'repo');
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(repo);
    fs.mkdirSync(bin);
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    git('remote', 'add', 'origin', remote ?? 'git@github.com:someone/pub.git');
    fs.writeFileSync(path.join(repo, 'notes.txt'), `${content}\n`);
    git('add', 'notes.txt');

    const ghLog = path.join(tmp, 'gh.log');
    fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!/bin/sh\necho "$*" >> '${ghLog}'\n` +
            (visibility === 'fail' ? 'exit 1\n' : `echo ${visibility}\n`),
        { mode: 0o755 },
    );
    fs.writeFileSync(
        path.join(bin, 'fnox'),
        '#!/bin/sh\nfor a; do key=$a; done\ncase $key in\n' +
            Object.entries(names)
                .map(([k, v]) => `  ${k}) echo '${v}' ;;\n`)
                .join('') +
            'esac\nexit 0\n',
        { mode: 0o755 },
    );

    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(repo, name), body);
    // `cached`: a visibility answer already in the hook's cache, `ageDays` old.
    if (cached) {
        const dir = path.join(tmp, 'cache', 'claude-hooks', 'repo-visibility');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'someone__pub');
        fs.writeFileSync(file, `${cached.answer}\n`);
        const when = Date.now() / 1000 - cached.ageDays * 86400;
        fs.utimesSync(file, when, when);
    }

    const input = JSON.stringify({ tool_input: { command: command ?? `git commit -m "${message}"` } });
    const res = spawnSync('bash', [HOOK], {
        cwd: repo,
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            HOME: tmp,
            XDG_CACHE_HOME: path.join(tmp, 'cache'),
            PATH: `${bin}:${process.env.PATH}`,
        },
    });
    const ghCalls = fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8') : '';
    fs.rmSync(tmp, { recursive: true, force: true });
    return { code: res.status, stderr: res.stderr, ghCalls };
}

test('public repo: a staged private IP is blocked', () => {
    const r = precheck({ content: sample.privateIp10 });
    assert.equal(r.code, 2, r.stderr);
});

test('public repo: a clean commit passes', () => {
    const r = precheck({ content: 'docs: describe the hook with <host> placeholders' });
    assert.equal(r.code, 0, r.stderr);
});

test('private repo: leak rules are not run', () => {
    const r = precheck({ content: sample.privateIp10, visibility: 'PRIVATE' });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.ghCalls, /someone\/pub/);
});

test('no GitHub remote: not checked and gh is not asked', () => {
    const r = precheck({
        content: sample.privateIp10,
        remote: 'git@ssh.dev.azure.com:v3/org/project/repo',
    });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.ghCalls, '');
});

test('visibility unknown (gh fails, nothing cached): treated as public', () => {
    const r = precheck({ content: sample.privateIp10, visibility: 'fail' });
    assert.equal(r.code, 2, r.stderr);
});

for (const key of ['privateIp172', 'privateIp192', 'cgnat', 'employer', 'headscale']) {
    test(`public repo: blocks ${key}`, () => {
        const r = precheck({ content: sample[key] });
        assert.equal(r.code, 2, r.stderr);
    });
}

test('public repo: the private name is redacted from the block message', () => {
    const r = precheck({ content: sample.employer });
    assert.doesNotMatch(r.stderr, /Acmecorp/i);
});

test('public repo: a range named by its base address passes', () => {
    const r = precheck({ content: `tailnet range ${ip(100, 64, 0, 0)}/10` });
    assert.equal(r.code, 0, r.stderr);
});

test('names fnox lacks are skipped, not guessed', () => {
    const r = precheck({ content: sample.employer, names: {} });
    assert.equal(r.code, 0, r.stderr);
});

test('public repo: blocks a *.ts.net host', () => {
    const r = precheck({ content: sample.tsNet });
    assert.equal(r.code, 2, r.stderr);
});

test("public repo: another owner's issue in the commit message is blocked", () => {
    const r = precheck({ content: 'clean', message: `fix: retry, as in ${sample.foreignIssue}` });
    assert.equal(r.code, 2, r.stderr);
});

test("public repo: Drew's own issue references pass", () => {
    const r = precheck({
        content: `tracked in ${'Drewtopia'}/claude-vault#59`,
        message: `feat: leak rules (${'drewtopia'}/dotfiles#12)`,
    });
    assert.equal(r.code, 0, r.stderr);
});

// A citation in a file is the "why" of a workaround and creates no backlink on GitHub; only a
// commit message (or PR text) does, so file contents may cite upstream issues.
test("public repo: another owner's issue cited in a staged file passes", () => {
    const r = precheck({ content: `# workaround for ${sample.foreignIssue}` });
    assert.equal(r.code, 0, r.stderr);
});

test('a GitHub remote the parser cannot read is scanned as unknown, not private', () => {
    const r = precheck({ content: sample.privateIp10, remote: 'ssh://git@github.com:22/someone/pub.git' });
    assert.equal(r.code, 2, r.stderr);
});

test('a cached private answer lasts a day, and a stale one counts as unknown when gh fails', () => {
    const fresh = precheck({ content: sample.privateIp10, visibility: 'fail', cached: { answer: 'PRIVATE', ageDays: 0.5 } });
    assert.equal(fresh.code, 0, fresh.stderr);
    assert.equal(fresh.ghCalls, '');
    const stale = precheck({ content: sample.privateIp10, visibility: 'fail', cached: { answer: 'PRIVATE', ageDays: 2 } });
    assert.equal(stale.code, 2, stale.stderr);
    const refreshed = precheck({ content: sample.privateIp10, visibility: 'PRIVATE', cached: { answer: 'PRIVATE', ageDays: 2 } });
    assert.equal(refreshed.code, 0, refreshed.stderr);
    assert.match(refreshed.ghCalls, /someone\/pub/);
});

test("public repo: another owner's issue in a commit -F message file is blocked", () => {
    for (const command of ['git commit -F msg.txt', 'git commit --file=msg.txt', 'git commit -q --file msg.txt']) {
        const r = precheck({ content: 'clean', command, files: { 'msg.txt': `fix: retry, as in ${sample.foreignIssue}\n` } });
        assert.equal(r.code, 2, `${command}: ${r.stderr}`);
    }
});
