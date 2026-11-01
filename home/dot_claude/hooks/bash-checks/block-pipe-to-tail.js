'use strict';
// gap: permissions.deny Bash rules match a command prefix; they cannot tell which stage of a pipeline feeds tail.
// Blocks a test, build, lint or commit command piped to tail or head. The cut keeps
// the summary and drops the line that says what failed, so the agent reruns the whole
// suite to see it. A log keeps every line for one run. The log goes under Claude
// Code's temp dir, /tmp/claude-<uid>/, the literal path dcg's redirect rule exempts
// (home/dot_config/dcg/config.toml.tmpl); a $VAR there would not be exempt.

const { getCommand } = require('../lib/hook-io');
const { splitUnquoted, mask, rewriteHeredocs } = require('../lib/shell');

const CUTTERS = new Set(['tail', 'head']);
// Reading whatever a command lists or prints about itself is not a result.
const LISTING = /(?:^|\s)--(?:list|help|version)\b/;

// Words that only run the next word: `timeout 600 pnpm test`, `npx -y tsc`.
const RUNNERS = new Set(['time', 'nice', 'env', 'command', 'exec', 'timeout', 'npx', 'pnpx', 'bunx', 'stdbuf']);
// Package managers whose `exec`/`dlx`/`x` runs a tool, and `run` runs a script.
const PMS = new Set(['pnpm', 'npm', 'yarn', 'bun']);
// Package-manager flags that take a value: `pnpm --filter web test`.
const PM_VALUE_FLAGS = new Set(['--filter', '-F', '-C', '--dir', '--workspace', '--prefix']);
const SCRIPT = /^(?:test|build|lint|typecheck|type-check|check|e2e|tsc|vitest|jest)(?::\S*)?$/;
const TOOLS = new Set(['vitest', 'jest', 'tsc', 'tsgo', 'pytest', 'mocha', 'eslint', 'oxlint', 'ctest']);
const SUBCOMMANDS = {
    moon: /^(?:run|ci|check|test|exec)$|:/,
    playwright: /^test$/,
    cargo: /^(?:test|build|check|clippy|nextest)$/,
    go: /^(?:test|build|vet)$/,
    git: /^commit$/,
    dotnet: /^(?:test|build)$/,
    turbo: /^run$/,
    nx: /^(?:run|run-many|affected|test|build|lint)$/,
};

const base = w => w.replace(/^.*\//, '');

/** Words of one pipeline stage, past env assignments and wrappers that only run the next word. */
function commandWords(stage) {
    let words = mask(stage).split(/\s+/).filter(Boolean);
    for (;;) {
        const w = base(words[0] || '');
        if (/^[A-Za-z_]\w*=/.test(words[0] || '') || RUNNERS.has(w)) {
            words = words.slice(1);
            while (words[0] && (words[0].startsWith('-') || /^\d+[smhd]?$/.test(words[0]))) words = words.slice(1);
        } else if (w === 'mise' && /^(?:x|exec)$/.test(words[1] || '')) {
            const dd = words.indexOf('--');
            words = dd < 0 ? [] : words.slice(dd + 1);
        } else if (/^(?:uv|poetry)$/.test(w) && words[1] === 'run') words = words.slice(2);
        else if (/^python3?$/.test(w) && words[1] === '-m') words = words.slice(2);
        else return words;
    }
}

function decidesResult(stage) {
    const words = commandWords(stage);
    const cmd = base(words[0] || '');
    if (TOOLS.has(cmd) || cmd === 'make' || cmd === 'gradle' || cmd === 'mvn') return true;
    if (cmd === 'node') return words.includes('--test');
    if (SUBCOMMANDS[cmd]) return SUBCOMMANDS[cmd].test(words.slice(1).find(w => !w.startsWith('-')) || '');
    if (!PMS.has(cmd)) return false;
    for (let i = 1; i < words.length; i++) {
        const w = words[i];
        if (PM_VALUE_FLAGS.has(w)) i++;
        else if (w.startsWith('-')) continue;
        else if (/^(?:run|run-script)$/.test(w)) continue;
        else if (/^(?:exec|dlx|x)$/.test(w)) return decidesResult(words.slice(i + 1).join(' '));
        else return SCRIPT.test(w) || TOOLS.has(w) || (w === 'playwright' && words[i + 1] === 'test');
    }
    return false;
}

/** The first stage that decides a result in a pipeline that ends in tail or head, if any. */
function cutProducer(pipeline) {
    const stages = splitUnquoted(pipeline, /\|&?/g);
    const cutAt = stages.findIndex((s, i) => i > 0 && CUTTERS.has(base(commandWords(s)[0] || '')));
    if (cutAt < 0) return null;
    return stages.slice(0, cutAt).find(s => decidesResult(s) && !LISTING.test(mask(s))) || null;
}

function logPath(sessionId) {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    const name = String(sessionId || 'run').slice(0, 8).replace(/[^\w-]/g, '') || 'run';
    return `/tmp/claude-${uid}/${name}.log`;
}

function run(input) {
    // A heredoc body is a file's text or a commit message; its lines are not pipelines.
    const cmd = rewriteHeredocs(getCommand(input), () => '');
    if (!cmd) return { exitCode: 0 };
    const pipelines = splitUnquoted(cmd, /&&|\|\||;|\n/g);
    const producer = pipelines.map(cutProducer).find(Boolean);
    if (!producer) return { exitCode: 0 };
    const log = logPath(input?.session_id);
    const fixed = producer.includes('<<') ? '' : `  ${producer.replace(/\s*2>&1\s*$/, '')} > ${log} 2>&1; echo "exit $?"`;
    return {
        exitCode: 2,
        stderr: [
            'Blocked: a test, build or commit piped to tail or head drops the line that says what failed,',
            'and seeing it means running the whole thing again.',
            `Instead: replace the pipe with \`> ${log} 2>&1\`, a path dcg allows, so every line is kept:`,
            fixed,
            `Then read ${log} (Read tool, or rg -n 'fail|error' on it). tail on that file is fine.`,
        ]
            .filter(Boolean)
            .join('\n'),
    };
}

module.exports = { run, logPath };
