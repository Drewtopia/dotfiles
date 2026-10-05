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

/** Nearest `cd` before `index`, whose path is where later segments run. */
function cdBefore(segs, index) {
    for (let j = index - 1; j >= 0; j--) {
        const cd = segs[j].match(CD);
        if (cd) return cd[2];
    }
    return '';
}

module.exports = { CD, WRAPPER, unquote, mask, splitUnquoted, segments, cdBefore, rewriteHeredocs };
