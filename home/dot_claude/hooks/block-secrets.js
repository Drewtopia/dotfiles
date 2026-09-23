#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Read|Edit|Write + Bash|PowerShell) guard: block access to
 * sensitive files and literal provider-token shapes in shell commands.
 *
 * Lists hold files that carry secrets. Public keys, known_hosts, certificates,
 * plain config and source files stay readable. Change a list only together with its test.
 *
 * Wired standalone (not via pre-bash-dispatcher) because it spans PowerShell too.
 * Only HOOKS_DISABLED=pre:secrets:block turns it off.
 *
 * run(input) -> { exitCode: 0 } allow | { exitCode: 2, stderr } block
 */

const path = require('path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'pre:secrets:block';

// --- file-level matching (Read|Edit|Write) ---------------------------------

const SENSITIVE_FILENAMES = new Set([
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.test',
    '.env.test.local',
    '.env.production',
    '.env.production.local',
    '.env.staging',
    'secrets.json',
    'secrets.yaml',
    'secrets.yml',
    'secrets.toml',
    '.secrets',
    'credentials.json',
    'credentials.yaml',
    'service-account.json',
    'service_account.json',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    'id_dsa',
    '.npmrc',
    '.pypirc',
    '.yarnrc',
    '.docker/config.json',
    '.aws/credentials',
    'gcloud/credentials.db',
    '.azure/credentials',
    '.git-credentials',
    '.git/config',
    '.pgpass',
    '.my.cnf',
    '.mongorc.js',
]);

const SENSITIVE_EXTENSIONS = new Set([
    '.pem',
    '.key',
    '.p12',
    '.pfx',
    '.jks',
    '.keystore',
]);

const SENSITIVE_PATH_PATTERNS = [
    'secret',
    'credential',
    'private_key',
    'privatekey',
    '.env.',
    '/secrets/',
];

// Source files named for secrets (e.g. this hook) hold code, not secrets.
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.py', '.sh', '.md']);

// Committed templates that hold variable names only.
const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;

// --- provider-token shapes (Bash|PowerShell command scan) ------------------

/** [provider, regex] — first match wins, prefix+length tuned for low noise. */
const SECRET_TOKEN_PATTERNS = [
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
    ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
    ['OpenAI API key', /\bsk-[A-Za-z0-9]{48}\b/],
    ['Slack token', /\bxox[bpoars]-[A-Za-z0-9-]{20,}\b/],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['Stripe key', /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/],
];

// --- detectors --------------------------------------------------------------

/** @returns {{sensitive: boolean, reason: string}} */
function isSensitiveFile(filePath) {
    if (!filePath) return { sensitive: false, reason: '' };

    const fileName = path.basename(filePath);
    const fileLower = String(filePath).toLowerCase();

    // Names with a slash (.git/config) match as path endings.
    const known = [...SENSITIVE_FILENAMES].find(name =>
        name.includes('/')
            ? filePath === name || String(filePath).endsWith('/' + name)
            : name === fileName,
    );
    if (known) {
        return {
            sensitive: true,
            reason: `'${known}' is a known sensitive file`,
        };
    }
    const suffix = path.extname(filePath).toLowerCase();
    if (suffix && SENSITIVE_EXTENSIONS.has(suffix)) {
        return {
            sensitive: true,
            reason: `'${suffix}' files may contain private keys or certificates`,
        };
    }
    if (ENV_TEMPLATE.test(fileName)) return { sensitive: false, reason: '' };
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
        if (pattern === 'secret' && SOURCE_EXTENSIONS.has(suffix)) continue;
        if (fileLower.includes(pattern)) {
            return {
                sensitive: true,
                reason: `path contains sensitive pattern '${pattern}'`,
            };
        }
    }
    return { sensitive: false, reason: '' };
}

/** @returns {{matched: boolean, provider: string}} */
function secretInCommand(command) {
    if (!command) return { matched: false, provider: '' };
    for (const [provider, pattern] of SECRET_TOKEN_PATTERNS) {
        if (pattern.test(command)) return { matched: true, provider };
    }
    return { matched: false, provider: '' };
}

/** Extract file path from tool input (Read|Edit|Write), with a command fallback. */
function extractFilePath(data) {
    const toolInput = (data && data.tool_input) || {};
    for (const key of ['file_path', 'path', 'filename', 'file']) {
        if (key in toolInput) return toolInput[key];
    }
    const command = toolInput.command || '';
    if (command) {
        for (const name of SENSITIVE_FILENAMES) {
            if (command.includes(name)) return name;
        }
        for (const ext of SENSITIVE_EXTENSIONS) {
            if (command.includes(ext)) return command;
        }
    }
    return '';
}

// --- messages (byte-equivalent to the .py) ---------------------------------

const tokenMessage = (toolName, provider) =>
    `╔══════════════════════════════════════════════════════════════════╗
║                    🔒 SECURITY HOOK BLOCKED                       ║
╠══════════════════════════════════════════════════════════════════╣
║ Tool: ${toolName}
║
║ Reason: literal ${provider} detected in command string.
║
║ Tokens must not be embedded in shell commands — they leak via
║ shell history, process listings, CI logs, and screen scrapes.
║
║ Use an environment variable instead:
║   export TOKEN=$(<your-secret-source>)
║   command --header "Authorization: Bearer $TOKEN"
║
║ Or read from a secrets manager / .env at runtime.
╚══════════════════════════════════════════════════════════════════╝`;

const fileMessage = (toolName, filePath, reason) =>
    `╔══════════════════════════════════════════════════════════════════╗
║                    🔒 SECURITY HOOK BLOCKED                       ║
╠══════════════════════════════════════════════════════════════════╣
║ Tool: ${toolName}
║ File: ${filePath}
║
║ Reason: ${reason}
║
║ This file likely contains secrets, credentials, or private keys
║ that should not be accessed programmatically.
║
║ Recommended actions:
║ • Use environment variables instead of reading .env directly
║ • Ask the user for specific (non-sensitive) information
║ • Reference .env.example for variable names only
║ • Store secrets in a proper secrets manager
╚══════════════════════════════════════════════════════════════════╝`;

/**
 * Pure logic. Bash/PowerShell get a token-shape scan first, then every tool
 * falls through to the file-path scan (which also sniffs sensitive filenames
 * out of a shell command).
 *
 * run(input) -> { exitCode: 0 } | { exitCode: 2, stderr }
 */
function run(input) {
    const toolName = (input && input.tool_name) || 'unknown';

    if (toolName === 'Bash' || toolName === 'PowerShell') {
        const command = String(
            (input && input.tool_input && input.tool_input.command) || '',
        );
        const { matched, provider } = secretInCommand(command);
        if (matched)
            return { exitCode: 2, stderr: tokenMessage(toolName, provider) };
        // fall through to file-path scan — covers `cat .env` etc.
    }

    const filePath = extractFilePath(input);
    if (!filePath) return { exitCode: 0 };

    const { sensitive, reason } = isSensitiveFile(filePath);
    if (sensitive)
        return { exitCode: 2, stderr: fileMessage(toolName, filePath, reason) };

    return { exitCode: 0 };
}

// Only exit 2 blocks; a crash would let the call through.
function runSafely(input, check = run) {
    try {
        return check(input);
    } catch (err) {
        return { exitCode: 2, stderr: `block-secrets errored: ${err && err.message}` };
    }
}

async function main() {
    const raw = await readStdin();
    const input = parseInput(raw);

    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }

    const res = runSafely(input);
    if (res && res.exitCode === 2) {
        process.stderr.write(res.stderr + '\n');
        process.exit(2);
    }
    process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module)
    main().catch(err => {
        process.stderr.write(`block-secrets errored: ${err && err.message}\n`);
        process.exit(2);
    });

module.exports = {
    run,
    runSafely,
    isSensitiveFile,
    secretInCommand,
    extractFilePath,
    SENSITIVE_FILENAMES,
    SENSITIVE_EXTENSIONS,
    SENSITIVE_PATH_PATTERNS,
    SECRET_TOKEN_PATTERNS,
};
