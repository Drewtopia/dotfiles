#!/usr/bin/env node
'use strict';
// gap: no setting or permission rule checks reply text; only a Stop hook sees the final message.
// Stop: in a T3 Code session, refuse a reply that names, by relative path, a file that
// isn't on this machine. T3 links it anyway (pingdotgg/t3code#29421), so
// `packages/x.yaml` for a file on Home Assistant opens nothing. A path that resolves
// from the session folder, the repo root or a tracked file's path suffix passes: T3
// finds those since #28554 and #35337. Remove this hook once #29421 is fixed.
// Code blocks are skipped. One nudge per turn: when Claude is already continuing from
// a Stop hook, this lets it stop.

const fs = require('node:fs');
const path = require('node:path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { transcriptEntries } = require('./lib/transcript');
const { git, repoRoot } = require('./lib/git');

const HOOK_ID = 'stop:reply-paths';

const isT3 = env => env.CLAUDE_CODE_ENTRYPOINT === 't3-code' || Boolean(env.T3CODE_THREAD_ID);

// Two or more segments, the last ending in an extension; an optional :line. The
// lookbehind keeps absolute (/x, ~/x) and mid-word paths out. Only source and config
// extensions count, so `origin/main..HEAD`, `owner/repo.git`, `3/4.5x` and
// `read/write.lock` stay prose: a missed path costs nothing, a false hit costs a reply.
const RELATIVE_PATH = /(?<![\w/~.@:-])((?:\.{1,2}\/)?[\w.@-]+(?:\/[\w.@-]+)+\.([A-Za-z0-9]{1,8}))(?::\d+)?(?![\w/])/g;
const FILE_EXT = new Set(
    ('md mdx txt json jsonc yaml yml toml ini cfg conf ts tsx mts cts js jsx mjs cjs py rs go rb ' +
        'java kt cs swift sh bash zsh fish ps1 psm1 html css scss sql xml csv tmpl jinja lua nix')
        .split(' '),
);
const DOMAIN = /^[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/i;
const SCHEME = /^[a-z][\w+.-]*:/i;

/** Relative file paths a reader of `text` would see as links, in order, without repeats. */
function relativePaths(text) {
    const found = [];
    const add = p => {
        if (!found.includes(p)) found.push(p);
    };
    let prose = String(text || '').replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, '');
    // A link's text is a label, not a path T3 opens; only a relative target counts.
    prose = prose.replace(/\[[^\]\n]*\]\(<?([^)\s>]+)[^)]*\)/g, (_, target) => {
        if (!SCHEME.test(target) && !/^[/~#]/.test(target)) add(target);
        return ' ';
    });
    prose = prose.replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, ' ');
    for (const m of prose.matchAll(RELATIVE_PATH)) {
        const first = m[1].split('/')[0];
        // An npm scope (@scope/pkg) or a domain is not a file in the workspace.
        if (!FILE_EXT.has(m[2].toLowerCase()) || first.startsWith('@') || DOMAIN.test(first)) continue;
        add(m[0]);
    }
    return found;
}

/** True when `ref` (a relative path, maybe with :line) is a file under one of `bases` or in `tracked`. */
function resolvesLocally(ref, bases, tracked) {
    const p = ref.replace(/:\d+$/, '').replace(/^\.\//, '');
    if (bases.some(b => b && fs.existsSync(path.resolve(b, p)))) return true;
    return tracked.some(f => f === p || f.endsWith(`/${p}`));
}

/** Relative paths in `text` that T3 would link but can't open from here. */
const missingPaths = (text, bases, tracked) => relativePaths(text).filter(p => !resolvesLocally(p, bases, tracked));

function lastAssistantText(input) {
    if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
    const entries = transcriptEntries(input.transcript_path);
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
        const text = e.message.content.filter(c => c?.type === 'text').map(c => c.text).join('\n');
        if (text) return text;
    }
    return '';
}

async function main() {
    const input = parseInput(await readStdin());
    if (!isHookEnabled(HOOK_ID) || !isT3(process.env) || input.stop_hook_active) return 0;
    const text = lastAssistantText(input);
    if (!relativePaths(text).length) return 0;
    const cwd = input.cwd || process.cwd();
    const root = repoRoot(cwd);
    const tracked = root ? git(['-C', root, 'ls-files']).split('\n').filter(Boolean) : [];
    const paths = missingPaths(text, [cwd, root], tracked);
    if (!paths.length) return 0;
    process.stderr.write(
        `Your reply names files by relative path that don't exist here: ${paths.join(', ')}.\n` +
            'T3 still makes each one a link, and it opens nothing. Send a corrected reply: ' +
            'link a file on this machine at its absolute path, [name](/abs/path:line). A file ' +
            'that only exists on another host (Home Assistant, a server, a container) is named ' +
            'in words with its host, not as a path.\n',
    );
    return 2;
}

if (require.main === module)
    main().then(
        code => process.exit(code),
        err => {
            process.stderr.write(`[hook] ${HOOK_ID} errored: ${err && err.message}\n`);
            process.exit(0);
        },
    );

module.exports = { relativePaths, resolvesLocally, missingPaths, lastAssistantText, isT3 };
