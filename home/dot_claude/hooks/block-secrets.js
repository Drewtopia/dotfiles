#!/usr/bin/env node
'use strict';
// PreToolUse(Read|Edit|Write|Bash|PowerShell): block sensitive files and literal
// provider tokens in shell commands. A few Bash shapes that only name a file (ls,
// find, stat, test, git check-ignore, a jq filter) are allowed; anything else that
// names one is denied. Wired standalone, not via pre-bash-dispatcher, because it
// spans PowerShell too.

const fs = require('fs');
const path = require('path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { rewriteHeredocs, mask, splitUnquoted } = require('./lib/shell');

const HOOK_ID = 'pre:secrets:block';

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
    // mise's untracked local configs, where env secrets sit in plaintext.
    'mise.local.toml',
    'config.local.toml',
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

// First match wins; prefix + length tuned for low noise.
const SECRET_TOKEN_PATTERNS = [
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
    ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
    ['OpenAI API key', /\bsk-[A-Za-z0-9]{48}\b/],
    ['Slack token', /\bxox[bpoars]-[A-Za-z0-9-]{20,}\b/],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['Stripe key', /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/],
];

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

function secretInCommand(command) {
    if (!command) return { matched: false, provider: '' };
    for (const [provider, pattern] of SECRET_TOKEN_PATTERNS) {
        if (pattern.test(command)) return { matched: true, provider };
    }
    return { matched: false, provider: '' };
}

function extractFilePath(data) {
    const toolInput = (data && data.tool_input) || {};
    for (const key of ['file_path', 'path', 'filename', 'file']) {
        if (key in toolInput) return toolInput[key];
    }
    const command = String(toolInput.command || '');
    // After a cd, over ssh or in a nested shell, a relative name is not under the hook's cwd.
    const where = { cwd: data && data.cwd, sure: !ELSEWHERE.test(command) };
    // The allowances are bash's; in PowerShell `ls` is fine but `type` and `gc` read files.
    const scanned = data && data.tool_name === 'Bash' ? withoutNamesOnly(command) : command;
    return sensitiveTokenIn(scanned, where);
}

const ELSEWHERE = /(?:^|[\s;&|(`])(?:cd|pushd|ssh|(?:ba|z)?sh|eval)(?=\s|$)|\$\(|`/;

// Where the hook may read a command differently from the shell, nothing is allowed:
// a substitution, a redirect from a file or heredoc, or an escaped quote.
const UNCLEAR = /[<`]|[$>]\(|\\['"]/;
// Output sent nowhere, so a listing that drops it still only lists.
const QUIET = /\d*>&\d+|&?>>?\s*\/dev\/null\b/g;
const SEPARATOR = /&&|\|\||[;&\n]/g;
// Programs that only list or test names, at the start of a simple command.
const LISTER = /^(?:ls|stat|test|\[\[?|find|git(?:\s+-C\s+\S+)*\s+check-ignore)(?:\s|$)/;
// find's -exec family runs a reader on each match; its -f* actions write a file.
const FIND_ACTION = /(?:^|\s)-(?:exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls|files0-from)(?:\s|$)/;

const listsOnly = segment =>
    LISTER.test(segment) && !segment.includes('>') && !FIND_ACTION.test(segment.replace(/['"\\]/g, ''));

// `command` without the parts that only name a file: jq filters and, unless a pipe
// could feed the names to a reader (`ls .env* | xargs cat`), listing commands.
function withoutNamesOnly(command) {
    if (UNCLEAR.test(command)) return command;
    const text = withoutJqFilters(command);
    if (/(?<!\|)\|(?!\|)/.test(mask(text))) return text;
    return splitUnquoted(text.replace(QUIET, ' '), SEPARATOR).filter(s => !listsOnly(s)).join('\n');
}

// The first quoted word after jq and its plain short flags is the filter, where `.env`
// is a key. -f and -L take a file or directory; a filter that imports reads one.
const JQ_FILTER = /(^|[\s;&|(])jq((?:\s+-(?!\S*[fL])[A-Za-z]+)*)\s+('_*'|"_*")/g;

function withoutJqFilters(command) {
    let out = command;
    for (const m of mask(command).matchAll(JQ_FILTER)) {
        const end = m.index + m[0].length;
        const start = end - m[3].length;
        if (!/\b(?:import|include)\b/.test(command.slice(start, end)))
            out = out.slice(0, start) + ' '.repeat(end - start) + out.slice(end);
    }
    return out;
}

// A heredoc body read as data names no file it opens; in code a file is a string literal.
const stringLiterals = body => (body.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []).join(' ');
const readableText = command =>
    rewriteHeredocs(command, (body, kind) =>
        kind === 'data' ? '' : kind === 'code' ? stringLiterals(body) : body,
    );

// Only a whole path token names a file: `process.env` or `Object.keys` in a
// command is code, not `.env` or a `.key` file.
function sensitiveTokenIn(command, where = { sure: false }) {
    // Glob and brace characters are dropped so `.env*` and `{.env,x}` still name `.env`.
    // A token that starts with a known name (`.npmrc.bak`) reports that name; an
    // .npmrc reports its path, the file whose token was checked.
    const tokens = readableText(command)
        .split(/[\s'"`=<>|;&(),${}:]+/)
        .map(t => t.replace(/[*?[\]]/g, ''));
    for (const token of tokens) {
        const base = path.basename(token);
        if (ENV_TEMPLATE.test(base)) continue;
        // A regex (`\.key$`) escapes the dot a file name would carry.
        if (/\\\.\w+$/.test(base)) continue;
        // `id_rsa.pub` (and its `.pub.tmpl` template) is the public half.
        if (/\.pub(?:\.tmpl)?$/.test(base)) continue;
        if (base === '.npmrc') {
            if (!where.sure || npmrcHoldsToken(token, where.cwd)) return token;
            continue;
        }
        const name = [...SENSITIVE_FILENAMES].find(n =>
            n.includes('/')
                ? token === n || token.endsWith('/' + n)
                : base === n || base.startsWith(n + '.'),
        );
        if (name) return name;
        if (SENSITIVE_EXTENSIONS.has(path.extname(base).toLowerCase())) return token;
    }
    return '';
}

// An .npmrc is only a secret when it holds a literal auth value; `${NPM_TOKEN}` is a
// reference. A file the hook cannot read counts as holding one: it may sit on another
// host, and a missing file costs nothing to deny.
function npmrcHoldsToken(file, cwd) {
    const home = process.env.HOME || '';
    const resolved = path.resolve(cwd || process.cwd(), String(file).replace(/^~(?=\/|$)/, home));
    let text;
    try {
        text = fs.readFileSync(resolved, 'utf8');
    } catch {
        return true;
    }
    return /_(?:authToken|auth|password)\s*=\s*(?!\$\{)\S/.test(text);
}

const NPMRC_FIX = `║ • \`npm config list\` shows the settings with auth values as (protected)
║ • Reference the token as \${NPM_TOKEN} so the file holds no secret`;

const FILE_FIX = `║ • Names only are fine: ls, find -name, stat, test -f, git check-ignore
║ • Read .env.example (or the code that loads the file) for variable names
║ • Pass a value through an environment variable without printing it,
║   or ask the user for the specific non-secret detail you need`;

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

const fileMessage = (toolName, filePath, reason, fix = FILE_FIX) =>
    `╔══════════════════════════════════════════════════════════════════╗
║                    🔒 SECURITY HOOK BLOCKED                       ║
╠══════════════════════════════════════════════════════════════════╣
║ Tool: ${toolName}
║ File: ${filePath}
║
║ Reason: ${reason}
║
║ Reading its contents would put a secret in the transcript.
║
║ Instead:
${fix}
╚══════════════════════════════════════════════════════════════════╝`;

function run(input) {
    const toolName = (input && input.tool_name) || 'unknown';

    if (toolName === 'Bash' || toolName === 'PowerShell') {
        const command = String(
            (input && input.tool_input && input.tool_input.command) || '',
        );
        const { matched, provider } = secretInCommand(command);
        if (matched)
            return { exitCode: 2, stderr: tokenMessage(toolName, provider) };
    }

    const filePath = extractFilePath(input);
    if (!filePath) return { exitCode: 0 };

    const { sensitive, reason } = isSensitiveFile(filePath);
    if (!sensitive) return { exitCode: 0 };
    if (path.basename(String(filePath)) !== '.npmrc')
        return { exitCode: 2, stderr: fileMessage(toolName, filePath, reason) };
    // A command's .npmrc was checked where it matched; a file tool's is checked here.
    const isCommand = toolName === 'Bash' || toolName === 'PowerShell';
    if (!isCommand && !npmrcHoldsToken(filePath, input.cwd)) return { exitCode: 0 };
    const why = `${reason} that holds an auth token, or the hook could not read it to check`;
    return { exitCode: 2, stderr: fileMessage(toolName, filePath, why, NPMRC_FIX) };
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
