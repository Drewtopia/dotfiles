'use strict';
// gap: permissions.deny Bash rules match the command only; they cannot read a --body-file.
// Gates `gh pr create` on its body carrying the mattpocock-skills:pr template headings.
// An inline --body is checked against the whole command, so a heredoc body counts. A body
// the hook cannot read (stdin, a missing file) and --web, where a person writes it, allow.

const fs = require('node:fs');
const path = require('node:path');
const { getCommand } = require('../lib/hook-io');
const { segments, cdBefore, shellWords } = require('../lib/shell');

const CREATE = /^gh\s+pr\s+create(?=\s|$)/;
const HEADINGS = ['## Summary', '## Evidence', '## Merge Danger'];

/** The first `gh pr create` in `cmd`: its words and the directory it runs in, or null. */
function prCreate(cmd) {
    const segs = segments(cmd);
    const i = segs.findIndex(s => CREATE.test(s.trim()));
    if (i < 0) return null;
    return { words: shellWords(segs[i].trim()), dir: cdBefore(segs, i) };
}

/** The value of a flag given as `--flag v`, `--flag=v` or `-f v`, or undefined. */
function flag(words, long, short) {
    for (let j = 0; j < words.length; j++) {
        const w = words[j];
        if (w === long || w === short) return words[j + 1] || '';
        if (w.startsWith(`${long}=`)) return w.slice(long.length + 1);
    }
    return undefined;
}

const missing = body => HEADINGS.filter(h => !new RegExp(`^${h}\\b`, 'm').test(body));

function run(input, deps = {}) {
    const read = deps.readFile || (p => fs.readFileSync(p, 'utf8'));
    const cmd = getCommand(input);
    if (!cmd || !/gh\s+pr\s+create/.test(cmd)) return { exitCode: 0 };
    const call = prCreate(cmd);
    if (!call || call.words.includes('--web') || call.words.includes('-w')) return { exitCode: 0 };

    let body;
    const file = flag(call.words, '--body-file', '-F');
    if (file === '-') return { exitCode: 0 };
    if (file !== undefined) {
        try {
            body = read(path.resolve(input.cwd || '.', call.dir || '.', file));
        } catch {
            return { exitCode: 0 };
        }
    } else if (flag(call.words, '--body', '-b') !== undefined) {
        body = cmd;
    } else {
        body = '';
    }

    const gaps = missing(body);
    if (!gaps.length) return { exitCode: 0 };
    return {
        exitCode: 2,
        stderr: [
            `🛑 BLOCKED: the PR body is missing ${gaps.join(', ')}.`,
            'Write it with the mattpocock-skills:pr skill, save it to a file, then:',
            '  gh pr create --title "<title>" --body-file <file>',
            'To open it anyway, run it yourself with the ! prefix: ! gh pr create ...',
        ].join('\n'),
    };
}

module.exports = { run, prCreate, missing };
