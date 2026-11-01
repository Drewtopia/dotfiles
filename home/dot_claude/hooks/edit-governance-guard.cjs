#!/usr/bin/env node
// UserPromptExpansion (--expansion): the user typing an UNLOCKING command unlocks governance surfaces
// for that session only, for 2h. PreToolUse(Edit|Write): deny governance surfaces otherwise.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const UNLOCK_MS = 2 * 60 * 60 * 1000;
const MARKER_DIR = path.join(os.homedir(), '.claude', 'governance-unlock');
const UNLOCKING = new Set(['edit-governance', 'audit-rules-and-skills', 'reorganize-memory']);

const GOVERNED = [
    /\/\.github\/workflows\//,
    /\/\.azuredevops\//,
    /\/azure-pipelines[^/]*\.ya?ml$/,
    /\/lefthook[^/]*\.ya?ml$/,
    /\/\.moon\//,
    /\/SKILL\.md$/,
    // `.claude-<name>` is a CLAUDE_CONFIG_DIR config, governed like `~/.claude`.
    /\/(dot_claude|\.claude(-[\w.-]+)?)\/(rules|hooks|skills|commands|mods)\//,
    /\/(dot_claude|\.claude(-[\w.-]+)?)\/[^/]*settings[^/]*\.json(\.tmpl)?$/,
    /\/\.chezmoitemplates\/claude-settings-merge$/,
    /\/\.claude\/governance-unlock(\/|$)/,
    /\/\.?claude-vault\/(?:[^/]+\/)?(?:rules|mods|\.githooks)\//,
    /\/(CLAUDE|AGENTS)(\.local)?\.md$/,
    /\/docs\/adr\//,
    /\/CONTEXT(-MAP)?\.md$/,
];

// Nothing loads config from the temp directory, so a governed-looking file there is a draft.
const TEMP_ROOTS = [...new Set(['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', os.tmpdir()])];

const underRoot = (p, root) => p === root || p.startsWith(`${root}/`);

/** Real path of `fp`'s deepest existing ancestor, so a symlink out of temp is followed. */
function realAncestor(fp) {
    for (let p = fp; ; p = path.dirname(p)) {
        try {
            return path.join(fs.realpathSync(p), path.relative(p, fp));
        } catch {
            if (p === path.dirname(p)) return fp;
        }
    }
}

function inTemp(fp) {
    const p = path.resolve(fp);
    if (!TEMP_ROOTS.some(r => underRoot(p, r))) return false;
    const real = realAncestor(p);
    const realRoots = TEMP_ROOTS.map(r => realAncestor(r));
    return [...TEMP_ROOTS, ...realRoots].some(r => underRoot(real, r));
}

const isGoverned = fp => GOVERNED.some(re => re.test(fp)) && !inTemp(fp);

const ASK_DREW =
    "Only Drew can run /edit-governance; agents can't invoke it. Stop and ask him to run it: " +
    'it scopes, edits, and reviews the change, and unlocks this session only.';

function markerPath(sessionId) {
    if (!/^[\w-]+$/.test(String(sessionId || ''))) return null;
    return path.join(MARKER_DIR, `session-${sessionId}`);
}

function unlocked(sessionId) {
    const p = markerPath(sessionId);
    if (!p) return false;
    try {
        return Date.now() - fs.statSync(p).mtimeMs < UNLOCK_MS;
    } catch {
        return false;
    }
}

function grantOnExpansion(data) {
    const p = markerPath(data.session_id);
    if (!p || !UNLOCKING.has(data.command_name)) return false;
    fs.mkdirSync(MARKER_DIR, { recursive: true });
    fs.writeFileSync(p, String(Date.now()));
    return true;
}

function decide(data, isUnlocked = unlocked) {
    const fp = (data.tool_input && data.tool_input.file_path) || '';
    if (!fp || !isGoverned(fp)) return null;
    if (isUnlocked(data.session_id)) return null;
    return `Governance surface: ${fp}\nDirect edits are forbidden. ${ASK_DREW}`;
}

// Only exit 2 or a deny decision blocks; a crash would let the edit through.
function denyOnError(fn) {
    try {
        return fn();
    } catch (err) {
        return `edit-governance-guard errored: ${err && err.message}`;
    }
}

function main() {
    const raw = fs.readFileSync(0, 'utf8');
    if (process.argv.includes('--expansion')) {
        try {
            grantOnExpansion(JSON.parse(raw));
        } catch {
            /* never block the user's command */
        }
        return;
    }
    const reason = denyOnError(() => decide(JSON.parse(raw)));
    if (!reason) return;
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: reason,
            },
        }),
    );
}

if (require.main === module) main();

module.exports = { ASK_DREW, decide, denyOnError, grantOnExpansion, isGoverned, markerPath, unlocked };
