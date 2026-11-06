'use strict';
// gap: permissions.deny Bash rules match the command only; they cannot read the issue body or its blockers' state.
// Gates `gh issue close <n>` on every issue its body lists after "Blocked by" being
// closed. A failed gh lookup allows, so a network blip cannot block a close.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { getCommand } = require('../lib/hook-io');
const { unquote, splitUnquoted, segments, cdBefore } = require('../lib/shell');

const CLOSE = /^gh\s+issue\s+close(?=\s|$)/;
// Close options that take a value, so the value is not read as the issue.
const VALUE_FLAGS = new Set(['-c', '--comment', '-r', '--reason', '--duplicate-of', '-R', '--repo']);
const REF = /(?:^|[^\w/])(?:#|GH-)(\d+)\b/gi;
const HEADING = /^\s*#{1,6}\s/;
const BLOCKED_BY = /blocked\s+by\b/i;

/** Each `gh issue close` in `cmd`: its issue, `--repo` value and directory. */
function closes(cmd, cwd = '') {
    const segs = segments(cmd);
    const out = [];
    segs.forEach((seg, i) => {
        const m = seg.match(CLOSE);
        if (!m) return;
        const words = splitUnquoted(seg.slice(m[0].length), /\s+/g).map(unquote);
        let issue = '';
        let repo = '';
        for (let j = 0; j < words.length; j++) {
            const w = words[j];
            const eq = w.match(/^(--repo|-R)=(.+)$/);
            if (eq) repo = eq[2];
            else if (VALUE_FLAGS.has(w)) {
                if (w === '-R' || w === '--repo') repo = words[j + 1] || '';
                j++;
            } else if (!w.startsWith('-') && !issue) issue = w;
        }
        // A URL names its own repo.
        const url = issue.match(/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/);
        if (url) [repo, issue] = [repo || url[1], url[2]];
        issue = issue.replace(/^#/, '');
        if (!/^\d+$/.test(issue)) return;
        out.push({ issue, repo, dir: path.resolve(cwd || '.', cdBefore(segs, i) || '.') });
    });
    return out;
}

const refsIn = text => [...text.matchAll(REF)].map(m => m[1]);

/** Issue numbers the body lists after "Blocked by": the rest of that sentence, or the list under that heading. */
function blockers(body) {
    const found = [];
    const lines = String(body || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const at = lines[i].search(BLOCKED_BY);
        if (at < 0) continue;
        const rest = lines[i].slice(at).replace(BLOCKED_BY, '');
        const sentence = rest.split(/\.\s/)[0];
        found.push(...refsIn(sentence));
        const opensList = HEADING.test(lines[i]) || /^[\s:*_]*$/.test(rest);
        if (!opensList) continue;
        for (let j = i + 1; j < lines.length && lines[j].trim() && !HEADING.test(lines[j]); j++)
            found.push(...refsIn(lines[j]));
    }
    return [...new Set(found)];
}

function ghJson(args, dir) {
    const out = execFileSync('gh', args, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
    });
    return JSON.parse(out);
}

function run(input, deps = {}) {
    const gh = deps.gh || ghJson;
    const cmd = getCommand(input);
    if (!cmd || !/gh\s+issue\s+close/.test(cmd)) return { exitCode: 0 };

    for (const { issue, repo, dir } of closes(cmd, input && input.cwd)) {
        const repoArgs = repo ? ['--repo', repo] : [];
        let body;
        try {
            body = gh(['issue', 'view', issue, '--json', 'body', ...repoArgs], dir).body;
        } catch {
            continue;
        }
        const open = blockers(body).filter(n => {
            if (n === issue) return false;
            try {
                return gh(['issue', 'view', n, '--json', 'state', ...repoArgs], dir).state === 'OPEN';
            } catch {
                return false;
            }
        });
        if (!open.length) continue;
        const list = open.map(n => `#${n}`).join(', ');
        const verb = open.length === 1 ? 'is' : 'are';
        const pronoun = open.length === 1 ? 'it' : 'them';
        return {
            exitCode: 2,
            stderr: [
                `🛑 #${issue} is blocked: ${list} ${verb} open; close ${pronoun} first or edit the Blocked by line.`,
                `To close it anyway, run it yourself with the ! prefix: ! gh issue close ${issue}${repo ? ` --repo ${repo}` : ''}`,
            ].join('\n'),
        };
    }
    return { exitCode: 0 };
}

module.exports = { run, closes, blockers };
