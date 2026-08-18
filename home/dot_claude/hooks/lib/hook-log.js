'use strict';
/**
 * Shared log sinks for observability hooks (audit, failure, snapshot).
 * Every function swallows errors: logging must never throw or block a hook.
 *
 * Per-project logs land in <repo>/.claude/logs/ and are made self-ignoring via
 * a logs/.gitignore ('*'), so no per-repo .gitignore setup is needed. Global
 * logs land in ~/.claude/logs/.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repoRoot } = require('./git');

/** mkdir -p the logs dir and drop a self-ignoring .gitignore once. */
function ensureLogsDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const gi = path.join(dir, '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n');
    return dir;
}

/** Append a line to <repo-or-cwd>/.claude/logs/<filename>. Never throws. */
function appendProjectLog(filename, line) {
    try {
        const root = repoRoot() || process.cwd();
        const dir = ensureLogsDir(path.join(root, '.claude', 'logs'));
        const text = line.endsWith('\n') ? line : `${line}\n`;
        fs.appendFileSync(path.join(dir, filename), text);
    } catch {
        /* best-effort */
    }
}

/** Append content to ~/.claude/logs/<filename>. Never throws. */
function appendGlobalLog(filename, content) {
    try {
        const dir = ensureLogsDir(path.join(os.homedir(), '.claude', 'logs'));
        fs.appendFileSync(path.join(dir, filename), content);
    } catch {
        /* best-effort */
    }
}

module.exports = { ensureLogsDir, appendProjectLog, appendGlobalLog };
