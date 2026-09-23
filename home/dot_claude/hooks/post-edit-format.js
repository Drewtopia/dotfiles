#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'post:edit:format';

const PRETTIER_EXT = new Set([
    'js',
    'jsx',
    'ts',
    'tsx',
    'json',
    'md',
    'yaml',
    'yml',
    'css',
    'scss',
    'html',
]);

function formattersFor(filePath) {
    if (!filePath) return [];
    const ext = filePath.includes('.')
        ? filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase()
        : '';
    if (PRETTIER_EXT.has(ext))
        return [{ bin: 'prettier', args: ['--write', filePath] }];
    switch (ext) {
        case 'py':
            return [
                { bin: 'black', args: ['--quiet', filePath] },
                { bin: 'ruff', args: ['check', '--fix', '--silent', filePath] },
            ];
        case 'go':
            return [{ bin: 'gofmt', args: ['-w', filePath] }];
        case 'rs':
            return [{ bin: 'rustfmt', args: [filePath] }];
        case 'sh':
        case 'bash':
            return [{ bin: 'shfmt', args: ['-w', filePath] }];
        default:
            return [];
    }
}

function extractFilePath(input) {
    const ti = (input && input.tool_input) || {};
    return ti.file_path || ti.path || '';
}

function run(input) {
    const filePath = extractFilePath(input);
    for (const f of formattersFor(filePath)) {
        try {
            spawnSync(f.bin, f.args, { stdio: 'ignore' });
        } catch {
            /* formatting never blocks */
        }
    }
    return { exitCode: 0 };
}

async function main() {
    const raw = await readStdin();
    const input = parseInput(raw);
    if (isHookEnabled(HOOK_ID)) {
        try {
            run(input);
        } catch {
            /* never block on a formatter */
        }
    }
    process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { run, formattersFor, extractFilePath, PRETTIER_EXT };
