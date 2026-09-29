#!/usr/bin/env node
'use strict';
// PostToolUse(Edit|Write): format the edited file, then lint it. JS-family tools come
// from the config at the file's git root and run only from that repo's node_modules,
// so a repo's own versions and plugins apply and a repo without a config is untouched.
// Only a linter reporting errors (exit 1) blocks: exit 2 feeds the errors to Claude.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { repoRoot } = require('./lib/git');

const HOOK_ID = 'post:edit:format';
const TIMEOUT_MS = 20000;
const MAX_LINES = 60;

const JS_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts']);
const PRETTIER_EXT = new Set([...JS_EXT, 'json', 'md', 'yaml', 'yml', 'css', 'scss', 'html']);
const BIOME_EXT = new Set([...JS_EXT, 'json', 'jsonc', 'css']);

const OXFMT_CONFIGS = ['.oxfmtrc.json', '.oxfmtrc.jsonc'];
const PRETTIER_CONFIGS = [
    '.prettierrc',
    ...['json', 'json5', 'yaml', 'yml', 'toml', 'js', 'cjs', 'mjs', 'ts'].map(e => `.prettierrc.${e}`),
    ...['js', 'cjs', 'mjs', 'ts'].map(e => `prettier.config.${e}`),
];
const BIOME_CONFIGS = ['biome.json', 'biome.jsonc'];
const OXLINT_CONFIGS = ['oxlint.config.ts', '.oxlintrc.json'];
const ESLINT_CONFIGS = [
    ...['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map(e => `eslint.config.${e}`),
    '.eslintrc',
    ...['json', 'js', 'cjs', 'yml', 'yaml'].map(e => `.eslintrc.${e}`),
];

const extOf = file => (file.includes('.') ? file.slice(file.lastIndexOf('.') + 1).toLowerCase() : '');

const fsRepo = {
    exists: p => fs.existsSync(p),
    readPackage: root => {
        try {
            return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        } catch {
            return {};
        }
    },
};

/** The repo's own binary for `tool` when `root` holds one of `configs` (or `configured`), else null. */
function repoTool(root, tool, configs, repo, configured = false) {
    if (!configured && !configs.some(c => repo.exists(path.join(root, c)))) return null;
    const bin = path.join(root, 'node_modules', '.bin', tool);
    return repo.exists(bin) ? bin : null;
}

function formattersFor(file, root, repo = fsRepo) {
    if (!file) return [];
    const ext = extOf(file);
    switch (ext) {
        case 'py':
            return [
                { bin: 'black', args: ['--quiet', file] },
                { bin: 'ruff', args: ['check', '--fix', '--silent', file] },
            ];
        case 'go':
            return [{ bin: 'gofmt', args: ['-w', file] }];
        case 'rs':
            return [{ bin: 'rustfmt', args: [file] }];
        case 'sh':
        case 'bash':
            return [{ bin: 'shfmt', args: ['-w', file] }];
    }
    if (!root) return [];
    const oxfmt = JS_EXT.has(ext) && repoTool(root, 'oxfmt', OXFMT_CONFIGS, repo);
    if (oxfmt) return [{ bin: oxfmt, args: [file] }];
    const prettier =
        PRETTIER_EXT.has(ext) &&
        repoTool(root, 'prettier', PRETTIER_CONFIGS, repo, 'prettier' in repo.readPackage(root));
    if (prettier) return [{ bin: prettier, args: ['--write', file] }];
    const biome = BIOME_EXT.has(ext) && repoTool(root, 'biome', BIOME_CONFIGS, repo);
    if (biome) return [{ bin: biome, args: ['format', '--write', file] }];
    return [];
}

function lintersFor(file, root, repo = fsRepo) {
    if (!file || !root || !JS_EXT.has(extOf(file))) return [];
    const oxlint = repoTool(root, 'oxlint', OXLINT_CONFIGS, repo);
    const eslint = repoTool(root, 'eslint', ESLINT_CONFIGS, repo);
    return [
        ...(oxlint ? [{ bin: oxlint, args: ['--no-error-on-unmatched-pattern', file] }] : []),
        ...(eslint ? [{ bin: eslint, args: [file] }] : []),
    ];
}

function extractFilePath(input) {
    const ti = (input && input.tool_input) || {};
    return ti.file_path || ti.path || '';
}

const spawnTool = (cmd, args, cwd) =>
    spawnSync(cmd, args, { cwd: cwd || undefined, encoding: 'utf8', timeout: TIMEOUT_MS });

function run(input, deps = {}) {
    const repo = { ...fsRepo, ...deps };
    const spawn = deps.spawn || spawnTool;
    const file = extractFilePath(input);
    if (!file) return { exitCode: 0 };
    const root = (deps.repoRoot || repoRoot)(path.dirname(file));

    for (const f of formattersFor(file, root, repo)) {
        try {
            spawn(f.bin, f.args, root);
        } catch {
            /* formatting never blocks */
        }
    }
    const errors = [];
    for (const l of lintersFor(file, root, repo)) {
        let res;
        try {
            res = spawn(l.bin, l.args, root);
        } catch {
            continue;
        }
        if (res && res.status === 1) errors.push(`${res.stdout || ''}${res.stderr || ''}`.trim());
    }
    if (errors.length === 0) return { exitCode: 0 };
    const lines = errors.join('\n').split('\n');
    const shown = lines.slice(0, MAX_LINES).join('\n');
    const more = lines.length > MAX_LINES ? `\n… ${lines.length - MAX_LINES} more lines` : '';
    return { exitCode: 2, stderr: `Lint errors in ${file}:\n${shown}${more}` };
}

async function main() {
    const raw = await readStdin();
    const input = parseInput(raw);
    let res = { exitCode: 0 };
    if (isHookEnabled(HOOK_ID)) {
        try {
            res = run(input);
        } catch {
            /* a broken hook never blocks the edit */
        }
    }
    if (res.stderr) process.stderr.write(res.stderr + '\n');
    process.stdout.write(raw);
    process.exit(res.exitCode);
}

if (require.main === module) main();

module.exports = { run, formattersFor, lintersFor, extractFilePath, PRETTIER_EXT };
