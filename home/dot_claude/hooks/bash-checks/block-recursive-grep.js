'use strict';
// gap: permissions.deny Bash rules match a command prefix and give no reason; they cannot
// tell `grep -rn x .` from `git log | grep x`, or say to use rg instead.
// Blocks a recursive grep. On macOS and Linux, Claude Code's grep is an embedded ugrep that
// reads .gitignored folders (node_modules, build output, target/), so one search can flood
// the context. rg skips them, and ~/.config/ripgrep/config already adds line numbers.

const { getCommand } = require('../lib/hook-io');
const { segments, shellWords, commandWords } = require('../lib/shell');

const GREPS = new Set(['grep', 'egrep', 'fgrep']);
const LONG = /^--(?:dereference-)?recursive$|^--directories=recurse$/;
// Short flags whose value follows, in the same word or the next: `-e -r` searches for "-r".
const TAKES_VALUE = new Set([...'efABCmdD']);
const LONG_TAKES_VALUE = new Set(['--regexp', '--file', '--directories']);

const base = w => w.replace(/^.*\//, '');

function isRecursiveGrep(segment) {
    const words = commandWords(shellWords(segment));
    if (!GREPS.has(base(words[0] || ''))) return false;
    for (let i = 1; i < words.length; i++) {
        const w = words[i];
        if (w === '--') return false;
        if (LONG.test(w)) return true;
        if (LONG_TAKES_VALUE.has(w)) {
            if (w === '--directories' && words[i + 1] === 'recurse') return true;
            i++;
        } else if (/^-[^-]/.test(w)) {
            for (const [j, c] of [...w.slice(1)].entries()) {
                if (c === 'r' || c === 'R') return true;
                if (!TAKES_VALUE.has(c)) continue;
                const value = w.slice(j + 2) || words[++i];
                if (c === 'd' && value === 'recurse') return true;
                break;
            }
        }
    }
    return false;
}

function run(input) {
    const cmd = getCommand(input);
    if (!cmd || !segments(cmd).some(isRecursiveGrep)) return { exitCode: 0 };
    return {
        exitCode: 2,
        stderr: [
            'Blocked: a recursive grep also reads .gitignored folders (node_modules, build output),',
            'so one search can flood the context.',
            "Instead: rg 'pattern' path. It skips ignored files and prints line numbers.",
            "grep's --include=GLOB is rg -g 'GLOB'; -i, -l, -w, -F, -v, -c and -A/-B/-C work as in grep.",
            'To search ignored files too: rg -uu.',
        ].join('\n'),
    };
}

module.exports = { run };
