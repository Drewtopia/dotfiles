'use strict';
// ponytail: approximates sh with regexes; command substitution and nested quotes are not
// modelled, and a heredoc is judged by the command on its line. A shell grammar is the
// upgrade if a check needs more.

const path = require('path');

const CD = /^cd\s+(?:--\s+)?(['"]?)([^'"]+)\1\s*$/;
const WRAPPER = /^(?:eval|xargs(?:\s+-\S+)*|(?:ba|z)?sh\s+-c)\s+([\s\S]+)$/;

const unquote = s => s.replace(/^(['"])([\s\S]*)\1$/, '$2');

const mask = s => s.replace(/'[^']*'|"[^"]*"/g, m => m[0] + '_'.repeat(m.length - 2) + m[0]);

/** Split `s` on `sep` (a global regex) outside quotes, returning trimmed slices of `s`. */
function splitUnquoted(s, sep) {
    const parts = [];
    let from = 0;
    for (const m of mask(s).matchAll(sep)) {
        parts.push(s.slice(from, m.index));
        from = m.index + m[0].length;
    }
    parts.push(s.slice(from));
    return parts.map(p => p.trim()).filter(Boolean);
}

// Who reads a quoted heredoc body (`<<'EOF'`) when nothing pipes it on: DATA readers take
// it as text, CODE interpreters as their own language, where a file is a string literal.
// Anyone else is a shell, as is an unquoted body, whose `$(...)` the shell runs.
const DATA = new Set(['cat', 'tee', 'git', 'gh', 'az', 'jq']);
const CODE = new Set(['python', 'python3', 'node', 'bun', 'deno', 'ruby', 'perl']);
const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g;

/** Each heredoc body in `cmd`: its span and who reads it ('data', 'code' or 'shell'). */
function heredocs(cmd) {
    return [...cmd.matchAll(HEREDOC)].map(m => {
        const head = cmd.slice(cmd.lastIndexOf('\n', m.index) + 1, m.index);
        const words = head.split(/&&|\|\||[;|(`{]/).pop().trim().split(/\s+/);
        const reader = path.basename(words.find(w => !/^[A-Za-z_]\w*=/.test(w)) || '');
        const isInert = m[1] !== '' && !m[3].includes('|');
        const kind = isInert && DATA.has(reader) ? 'data' : isInert && CODE.has(reader) ? 'code' : 'shell';
        const start = m.index + m[0].indexOf('\n') + 1;
        return { start, end: start + m[4].length, kind };
    });
}

/** `cmd` with each heredoc body replaced by `fn(body, kind)`. */
function rewriteHeredocs(cmd, fn) {
    let out = '';
    let from = 0;
    for (const h of heredocs(cmd)) {
        out += cmd.slice(from, h.start) + fn(cmd.slice(h.start, h.end), h.kind);
        from = h.end;
    }
    return out + cmd.slice(from);
}

// A data body runs nothing. Any other body keeps its lines, its quotes blanked so an
// apostrophe in it cannot pair with a quote after the heredoc.
const segments = cmd =>
    splitUnquoted(
        rewriteHeredocs(cmd, (body, kind) => (kind === 'data' ? '' : body.replace(/['"`]/g, ' '))),
        /&&|\|\||[;|\n]/g,
    );

/** Words of `s`, split outside quotes, each with its quotes removed. */
const shellWords = s =>
    (s.match(/(?:'[^']*'|"(?:\\.|[^"\\])*"|[^\s'"])+/g) || []).map(w =>
        w.replace(/'([^']*)'|"((?:\\.|[^"\\])*)"/g, (_, a, b) => (a !== undefined ? a : b)),
    );

// Words that only run the next word (`timeout 600 pnpm test`, `npx -y tsc`), and the
// shell keywords that can stand before a command.
const RUNNERS = new Set([
    'sudo', 'env', 'time', 'nice', 'command', 'exec', 'xargs', 'timeout', 'stdbuf',
    'npx', 'pnpx', 'bunx',
    '{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until',
]);

// Runner flags whose value is the next word, so the value is not taken for the program.
const RUNNER_VALUE_FLAGS = {
    sudo: /^-[ugpChDrtUT]$|^--(?:user|group|prompt|close-from|host|chdir|role|type|other-user)$/,
    env: /^-[uC]$|^--(?:unset|chdir)$/,
    nice: /^-n$|^--adjustment$/,
    timeout: /^-[sk]$|^--(?:signal|kill-after)$/,
    stdbuf: /^-[ioe]$/,
    xargs: /^-[IiLlnPsdEa]$|^--(?:replace|max-lines|max-args|max-procs|max-chars|delimiter|eof|arg-file)$/,
    time: /^-[fo]$|^--(?:format|output)$/,
    exec: /^-a$/,
    npx: /^-p$|^--package$/,
    pnpx: /^-p$|^--package$/,
    bunx: /^-p$|^--package$/,
};
// Runner flags whose value is itself a command line: where the program is, is unclear.
const RUNNER_COMMAND_FLAGS = { env: /^-S$|^--split-string/, npx: /^-c$|^--call/ };

/**
 * Index of the program in a simple command's `words`, past env assignments and runners;
 * -1 when it is unclear (`mise x` without `--`, `env -S '...'`), so a caller scans every word.
 */
function commandStart(words) {
    const base = i => path.basename(words[i] || '');
    let k = 0;
    for (;;) {
        const runner = base(k);
        if (/^[A-Za-z_]\w*=/.test(words[k] || '') || RUNNERS.has(runner)) {
            k++;
            while (k < words.length && (words[k].startsWith('-') || /^\d+[smhd]?$/.test(words[k]))) {
                if (RUNNER_COMMAND_FLAGS[runner]?.test(words[k])) return -1;
                k += RUNNER_VALUE_FLAGS[runner]?.test(words[k]) ? 2 : 1;
            }
        } else if (runner === 'mise' && /^(?:x|exec)$/.test(words[k + 1] || '')) {
            const dd = words.indexOf('--', k);
            if (dd < 0) return -1;
            k = dd + 1;
        } else if (/^(?:uv|poetry)$/.test(base(k)) && words[k + 1] === 'run') k += 2;
        else if (/^python3?$/.test(base(k)) && words[k + 1] === '-m') k += 2;
        else return k;
    }
}

/** A simple command's words from its program on; all of them when that is unclear. */
const commandWords = words => words.slice(Math.max(commandStart(words), 0));

/** Nearest `cd` before `index`, whose path is where later segments run. */
function cdBefore(segs, index) {
    for (let j = index - 1; j >= 0; j--) {
        const cd = segs[j].match(CD);
        if (cd) return cd[2];
    }
    return '';
}

module.exports = {
    CD,
    WRAPPER,
    unquote,
    mask,
    splitUnquoted,
    segments,
    cdBefore,
    rewriteHeredocs,
    shellWords,
    commandStart,
    commandWords,
};
