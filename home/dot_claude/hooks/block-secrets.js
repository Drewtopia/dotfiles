#!/usr/bin/env node
'use strict';
// PreToolUse(Read|Edit|Write|Bash|PowerShell): block reading a sensitive file's
// contents, and literal provider tokens in shell commands. A command that only names
// such a file (ls, git check-ignore, a jq path, a grep pattern) passes. Wired
// standalone, not via pre-bash-dispatcher, because it spans PowerShell too.

const fs = require('fs');
const path = require('path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { rewriteHeredocs, splitUnquoted, shellWords, commandStart } = require('./lib/shell');

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
    // The name-only rules below are bash's; in PowerShell `type` and `gc` read files.
    if (data && data.tool_name === 'PowerShell') return sensitiveTokenIn(command, where);
    return sensitiveReadIn(command, where);
}

const ELSEWHERE = /(?:^|[\s;&|(`])(?:cd|pushd|ssh|(?:ba|z)?sh|eval)(?=\s|$)|\$\(|`/;

// Commands that take a file's name but never print its contents.
const NAME_ONLY = new Set([
    'ls', 'find', 'test', '[', '[[', 'stat', 'touch', 'mkdir', 'chmod', 'chown', 'rm',
    'du', 'wc', 'file', 'realpath', 'readlink', 'dirname', 'basename', 'echo', 'printf',
    'which', 'type',
]);
const GIT_NAME_ONLY = new Set(['check-ignore', 'ls-files', 'status', 'add', 'rm', 'mv', 'commit']);
// Their first operand is a pattern, filter or script, not a file.
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag']);
const PATTERN_FIRST = new Set([...GREPS, 'sed', 'awk', 'jq', 'yq']);
// Options of PATTERN_FIRST commands whose value is the next word.
const VALUE_OPTS = new Set([
    '-e', '-f', '-m', '-A', '-B', '-C', '-g', '-t', '-T', '--regexp', '--file', '--glob',
    '--type', '--max-count', '--arg', '--argjson', '--slurpfile', '--rawfile',
]);
// A grep names matching files or counts them, never printing the lines, when it has
// one of its list or count flags and every other option is known to be harmless; any
// other option (`--json`, `-o`, `-g <glob>`) counts as reading the operands. rg's -L
// follows symlinks and its -r replaces, so they are not on its list.
const GREP_FLAVOUR = { grep: 'grep', egrep: 'grep', fgrep: 'grep', rg: 'rg', ag: 'rg' };
const NO_CONTENT = { grep: 'lLcq', rg: 'lcq' };
const HARMLESS = { grep: 'lLcqiwFnsrRE', rg: 'lcqiwFns' };
const NO_CONTENT_LONG = /^--(?:files-with-matches|count|quiet)$/;
const HARMLESS_LONG = /^--(?:fixed-strings|ignore-case)$/;

function namesOnly(program, rest) {
    const flavour = GREP_FLAVOUR[program];
    let listed = false;
    for (let j = 0; j < rest.length && rest[j] !== '--'; j++) {
        const w = rest[j];
        if (w === '-e' || w === '--regexp') j++;
        else if (NO_CONTENT_LONG.test(w)) listed = true;
        else if (HARMLESS_LONG.test(w)) continue;
        else if (/^-[^-]/.test(w)) {
            for (const ch of w.slice(1)) {
                if (!HARMLESS[flavour].includes(ch)) return false;
                if (NO_CONTENT[flavour].includes(ch)) listed = true;
            }
        } else if (w.startsWith('-')) return false;
    }
    return listed;
}
const SHELLS = new Set(['sh', 'bash', 'zsh']);
const SSH_VALUE_OPTS = /^-[bcDEeFIiJLlmOoPpQRSWw]$/;

// Simple commands in `command`, including the bodies of $(...), <(...) and backticks.
function simpleCommands(command) {
    const subs = [];
    const outer = command.replace(/[$<]\(([^()]*)\)|`([^`]*)`/g, (_, a, b) => {
        subs.push(a !== undefined ? a : b);
        return ' ';
    });
    return [...splitUnquoted(outer, /&&|\|\||[;|\n]|(?<!\\)[()]/g), ...subs.flatMap(simpleCommands)];
}

// The words of one simple command a program reads as files; redirect targets
// that write are dropped and `<` targets kept, whatever the program.
function readWords(words) {
    const reads = [];
    const args = [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const redirect = w.match(/^(\d*)(<<<|<<-?|<|>>?|&>>?)(.*)$/);
        if (!redirect) {
            args.push(w);
            continue;
        }
        const target = redirect[3] || words[++i] || '';
        if (redirect[2] === '<') reads.push(target);
    }

    const k = commandStart(args);
    // With no program found every word may be a file it reads. Where the program is
    // unclear it may also be fed names (`xargs -l cat`), so the whole command counts.
    if (k < 0) return { reads, nested: [], feedsNames: true };
    if (k >= args.length) return { reads: [...reads, ...args], nested: [] };
    const program = path.basename(args[k] || '');
    const rest = args.slice(k + 1);

    // `xargs cat` reads whatever names reach it, so any name in the command counts.
    if (args.slice(0, k).includes('xargs') && !NAME_ONLY.has(program))
        return { reads, nested: [], feedsNames: true };

    if (program === 'eval') return { reads, nested: [rest.join(' ')] };
    if (SHELLS.has(program) && rest[0] === '-c') return { reads, nested: [rest[1] || ''] };
    if (program === 'ssh') {
        let j = 0;
        while (j < rest.length && rest[j].startsWith('-')) j += SSH_VALUE_OPTS.test(rest[j]) ? 2 : 1;
        return { reads, nested: [rest.slice(j + 1).join(' ')] };
    }
    if (program === 'find' && rest.some(a => /^-(?:exec|execdir|ok|okdir)$/.test(a)))
        return { reads: [...reads, ...rest], nested: [] };
    if (NAME_ONLY.has(program)) return { reads, nested: [] };
    if (program === 'git') {
        // A -c value can name a file git reads (include.path) or a command it runs.
        const configs = [];
        let j = 0;
        while (j < rest.length && rest[j].startsWith('-')) {
            if (rest[j] === '-c') configs.push(rest[j + 1] || '');
            j += /^-[Cc]$/.test(rest[j]) ? 2 : 1;
        }
        if (GIT_NAME_ONLY.has(rest[j])) {
            // `commit -F <file>` reads the message from that file.
            const messageFiles = [];
            if (rest[j] === 'commit')
                for (let m = j + 1; m < rest.length && rest[m] !== '--'; m++) {
                    const file = rest[m].match(/^(?:-F|--file=)(.+)$/);
                    if (file) messageFiles.push(file[1]);
                    else if (/^(?:-F|--file)$/.test(rest[m])) messageFiles.push(rest[++m] || '');
                }
            return { reads: [...reads, ...configs, ...messageFiles], nested: [] };
        }
    }
    if (PATTERN_FIRST.has(program)) {
        if (GREPS.has(program) && namesOnly(program, rest))
            return { reads, nested: [] };
        const operands = [];
        let patternGiven = false;
        for (let j = 0; j < rest.length; j++) {
            if (rest[j] === '--') {
                operands.push(...rest.slice(j + 1));
                break;
            }
            if (VALUE_OPTS.has(rest[j])) {
                if (/^(?:-e|-f|--regexp|--file)$/.test(rest[j])) patternGiven = true;
                j += rest[j] === '--arg' || rest[j] === '--argjson' ? 2 : 1;
            } else if (!rest[j].startsWith('-')) operands.push(rest[j]);
        }
        return { reads: [...reads, ...(patternGiven ? operands : operands.slice(1))], nested: [] };
    }
    return { reads: [...reads, ...args.slice(k)], nested: [] };
}

// Command substitution, `eval`, `sh -c` and `${!v}` build words this hook never sees.
const RUNTIME_WORDS = /\$\(|`|\$\{!|(?:^|[\s;&|(])(?:eval|(?:ba|z)?sh\s+-c)\b/;
const ASSIGNED = /(?:^|[\s;&|(])[A-Za-z_]\w*=(\S+)/g;

// Whether `text` reads files under names built at run time, including a sensitive
// name stored in a variable and expanded later (`f=.env; cat "$f"`).
const buildsWords = (text, where) =>
    RUNTIME_WORDS.test(text) ||
    (/\$[A-Za-z_{]/.test(text) && [...text.matchAll(ASSIGNED)].some(m => sensitiveTokenIn(m[1], where)));

// The sensitive file a command reads, by name: '' when it only names one. `where` is
// the cwd its relative names resolve against, and whether that is sure.
function sensitiveReadIn(command, where, depth = 0) {
    if (depth > 3 || buildsWords(readableText(command), where)) return sensitiveTokenIn(command, where);
    for (const cmd of simpleCommands(readableText(command))) {
        const { reads, nested, feedsNames } = readWords(shellWords(cmd));
        if (feedsNames) return sensitiveTokenIn(command, where);
        const hit = sensitiveTokenIn(reads.join(' '), where);
        if (hit) return hit;
        for (const inner of nested) {
            const innerHit = sensitiveReadIn(inner, where, depth + 1);
            if (innerHit) return innerHit;
        }
    }
    return '';
}

// A heredoc body read as data names no file it opens; in code a file is a string literal.
const stringLiterals = body => (body.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []).join(' ');
const readableText = command =>
    rewriteHeredocs(command, (body, kind) =>
        kind === 'data' ? '' : kind === 'code' ? stringLiterals(body) : body,
    );

// Only a whole path token names a file: `process.env` or `Object.keys` in a
// command is code, not `.env` or a `.key` file.
function sensitiveTokenIn(command, where) {
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
        if (/\.pub(?:\.|$)/.test(base)) continue;
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

const FILE_FIX = `║ • Names only are fine: ls, find -name, git check-ignore, rg -l NAME <file>
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
