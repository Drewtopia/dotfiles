#!/usr/bin/env node
// PreToolUse guard: denies Edit/Write on governance surfaces unless a
// governance unlock marker (~/.claude/governance-unlock/, granted by the
// /edit-governance skill) is under 2h old. Denies on internal errors.
// CLI: `--unlock` grants a 2h unlock (own timestamped marker); `--lock` ends
// every unlock window on this machine — only use when no other governance
// flow is live.
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
    /\/\.claude-vault\/rules\//,
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
    // Timestamped per-invocation marker: concurrent flows each hold their own,
    // and expiry is by TTL — prune only stale markers here, never live ones.
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

/** @returns {string|null} deny reason, or null to allow */
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
