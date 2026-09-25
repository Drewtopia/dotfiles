'use strict';
// ponytail: approximates sh with regexes; command substitution, heredoc bodies and
// nested quotes are not modelled. A shell grammar is the upgrade if a check needs them.

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

const segments = cmd => splitUnquoted(cmd, /&&|\|\||[;|\n]/g);

/** Nearest `cd` before `index`, whose path is where later segments run. */
function cdBefore(segs, index) {
    for (let j = index - 1; j >= 0; j--) {
        const cd = segs[j].match(CD);
        if (cd) return cd[2];
    }
    return '';
}

module.exports = { CD, WRAPPER, unquote, mask, splitUnquoted, segments, cdBefore };
