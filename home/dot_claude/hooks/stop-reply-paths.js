#!/usr/bin/env node
'use strict';
// gap: no setting or permission rule checks reply text; only a Stop hook sees the final message.
// Stop: in a T3 Code session, refuse a reply that names a file by a relative path.
// T3 turns a path into a link and joins a relative one onto the workspace folder, so
// `packages/x.yaml` opens a file that isn't there. Code blocks are skipped. One nudge
// per turn: when Claude is already continuing from a Stop hook, this lets it stop.

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { transcriptEntries } = require('./lib/transcript');

const HOOK_ID = 'stop:reply-paths';

const isT3 = env => env.CLAUDE_CODE_ENTRYPOINT === 't3-code' || Boolean(env.T3CODE_THREAD_ID);

// Two or more segments, the last with an extension that holds a letter; an optional
// :line. The lookbehind keeps absolute (/x, ~/x) and mid-word paths out.
const RELATIVE_PATH =
    /(?<![\w/~.@:-])((?:\.{1,2}\/)?[\w.@-]+(?:\/[\w.@-]+)+\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,8})(?::\d+)?(?![\w/])/g;
const DOMAIN = /^[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/i;
const SCHEME = /^[a-z][\w+.-]*:/i;

/** Relative file paths a reader of `text` would see as links, in order, without repeats. */
function relativePaths(text) {
    const found = [];
    const add = p => {
        if (!found.includes(p)) found.push(p);
    };
    let prose = String(text || '').replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, '');
    prose = prose.replace(/\]\(<?([^)\s>]+)[^)]*\)/g, (_, target) => {
        if (!SCHEME.test(target) && !/^[/~#]/.test(target)) add(target);
        return ']';
    });
    prose = prose.replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, ' ');
    for (const m of prose.matchAll(RELATIVE_PATH)) {
        const first = m[1].split('/')[0];
        if (DOMAIN.test(first)) continue;
        add(m[0]);
    }
    return found;
}

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
    const paths = relativePaths(lastAssistantText(input));
    if (!paths.length) return 0;
    process.stderr.write(
        `Your reply names files by relative path: ${paths.join(', ')}.\n` +
            'T3 joins a relative path onto the workspace folder, so the link opens nothing. ' +
            'Send a corrected reply: link each file at its absolute path on this machine, ' +
            '[name](/abs/path:line). A file that only exists on another host (Home Assistant, ' +
            'a server, a container) is named in words with its host, not as a path.\n',
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

module.exports = { relativePaths, lastAssistantText, isT3 };
