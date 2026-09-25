#!/usr/bin/env node
// PreToolUse(Edit|Write): deny governance surfaces unless an unlock marker is under 2h old.
// `--unlock` adds a marker; `--lock` removes every marker, ending all sessions' unlocks.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const UNLOCK_MS = 2 * 60 * 60 * 1000;
const MARKER_DIR = path.join(os.homedir(), '.claude', 'governance-unlock');

const GOVERNED = [
    /\/\.github\/workflows\//,
    /\/azure-pipelines[^/]*\.ya?ml$/,
    /\/lefthook[^/]*\.ya?ml$/,
    /\/\.moon\//,
    /\/moon\.yml$/,
    /\/SKILL\.md$/,
    /\/(dot_claude|\.claude)\/(rules|hooks|skills|commands)\//,
    /\/(dot_claude|\.claude)\/[^/]*settings[^/]*\.json(\.tmpl)?$/,
    /\/\.?claude-vault\/(?:[^/]+\/)?rules\//,
    /\/(CLAUDE|AGENTS)(\.local)?\.md$/,
    /\/docs\/adr\//,
    /\/CONTEXT(-MAP)?\.md$/,
];

function markerFresh() {
    try {
        for (const f of fs.readdirSync(MARKER_DIR)) {
            if (Date.now() - fs.statSync(path.join(MARKER_DIR, f)).mtimeMs < UNLOCK_MS) return true;
        }
    } catch {
        /* no marker dir */
    }
    return false;
}

function lock() {
    let n = 0;
    try {
        for (const f of fs.readdirSync(MARKER_DIR)) {
            fs.unlinkSync(path.join(MARKER_DIR, f));
            n++;
        }
    } catch {
        /* no marker dir */
    }
    console.log(
        `governance lock: removed ${n} marker(s) — this ends EVERY session's unlock window on this machine`,
    );
}

function unlock() {
    fs.mkdirSync(MARKER_DIR, { recursive: true });
    // One marker per unlock so concurrent flows keep their own; prune only stale ones.
    try {
        for (const old of fs.readdirSync(MARKER_DIR)) {
            const p = path.join(MARKER_DIR, old);
            if (Date.now() - fs.statSync(p).mtimeMs >= UNLOCK_MS) fs.unlinkSync(p);
        }
    } catch {
        /* best effort */
    }
    const f = path.join(MARKER_DIR, `active-${Date.now()}`);
    fs.writeFileSync(f, String(Date.now()));
    console.log(`governance unlock granted for 2h (${f})`);
}

function decide(data, unlocked = markerFresh) {
    const fp = (data.tool_input && data.tool_input.file_path) || '';
    if (!fp || !GOVERNED.some(re => re.test(fp))) return null;
    if (unlocked()) return null;
    return (
        `Governance surface: ${fp}\n` +
        'Direct edits are forbidden. ' +
        'Invoke /edit-governance — it scopes, edits, and reviews the change, ' +
        'and grants a 2h unlock via `node ~/.claude/hooks/edit-governance-guard.cjs --unlock`.'
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
    if (process.argv.includes('--unlock')) return unlock();
    if (process.argv.includes('--lock')) return lock();
    const reason = denyOnError(() => decide(JSON.parse(fs.readFileSync(0, 'utf8'))));
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

module.exports = { decide, denyOnError };
