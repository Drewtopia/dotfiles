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
    /\/azure-pipelines[^/]*\.ya?ml$/,
    /\/lefthook[^/]*\.ya?ml$/,
    /\/\.moon\//,
    /\/moon\.yml$/,
    /\/SKILL\.md$/,
    /\/(dot_claude|\.claude)\/(rules|hooks|skills|commands)\//,
    /\/(dot_claude|\.claude)\/[^/]*settings[^/]*\.json(\.tmpl)?$/,
    /\/\.chezmoitemplates\/claude-settings-merge$/,
    /\/\.claude\/governance-unlock(\/|$)/,
    /\/\.?claude-vault\/(?:[^/]+\/)?rules\//,
    /\/(CLAUDE|AGENTS)(\.local)?\.md$/,
    /\/docs\/adr\//,
    /\/CONTEXT(-MAP)?\.md$/,
];

const isGoverned = fp => GOVERNED.some(re => re.test(fp));

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
    return (
        `Governance surface: ${fp}\n` +
        'Direct edits are forbidden. Stop and ask the user to run /edit-governance: ' +
        'it scopes, edits, and reviews the change, and unlocks this session only.'
    );
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

module.exports = { decide, denyOnError, grantOnExpansion, isGoverned, markerPath, unlocked };
