#!/usr/bin/env node
// PreToolUse guard: denies Edit/Write on governance surfaces unless the
// session holds a governance unlock (granted by the /edit-governance skill).
// Unlock state lives in the convergence session registry when available
// (<git-common-dir>/sessions/<session-id>.json, additive `governanceUnlockUntil`
// field — owned by session-registry.cjs, parsed tolerantly here), with a
// filesystem marker fallback (~/.claude/governance-unlock/) for non-repo paths
// and sessions whose id is unknown in Bash. Fails open on internal errors.
// CLI: `--unlock` grants a 2h unlock (own timestamped marker); `--lock` ends
// every unlock window on this machine — only use when no other governance
// flow is live.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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

function registryEntryUnlocked(baseDir, sessionId) {
    try {
        const common = execFileSync('git', ['-C', baseDir, 'rev-parse', '--git-common-dir'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const reg = path.join(
            path.isAbsolute(common) ? common : path.join(baseDir, common),
            'sessions',
            `${sessionId}.json`,
        );
        const data = JSON.parse(fs.readFileSync(reg, 'utf8'));
        return (
            typeof data.governanceUnlockUntil === 'number' &&
            data.governanceUnlockUntil > Date.now()
        );
    } catch {
        return false;
    }
}

// Checks the edited file's repo AND the cwd repo — governed files under
// ~/.claude/* live outside any repo (or a different one than cwd), where only
// the cwd-repo session record can vouch for the unlock.
function registryUnlocked(sessionId, filePath) {
    const fileDir = fs.existsSync(filePath)
        ? path.dirname(filePath)
        : path.dirname(path.resolve(filePath));
    return (
        registryEntryUnlocked(fileDir, sessionId) || registryEntryUnlocked(process.cwd(), sessionId)
    );
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
    // Best effort: also stamp the convergence registry entry for every live
    // session in the cwd repo, so registry-aware tooling sees the unlock.
    try {
        const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const sessDir = path.join(path.resolve(common), 'sessions');
        for (const name of fs.readdirSync(sessDir)) {
            if (!name.endsWith('.json')) continue;
            const p = path.join(sessDir, name);
            if (Date.now() - fs.statSync(p).mtimeMs > 30 * 60 * 1000) continue; // live only
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                data.governanceUnlockUntil = Date.now() + UNLOCK_MS;
                fs.writeFileSync(p, JSON.stringify(data));
            } catch {
                /* skip malformed entry */
            }
        }
    } catch {
        /* not a repo or no registry — marker alone is enough */
    }
    console.log(`governance unlock granted for 2h (${f})`);
}

function main() {
    if (process.argv.includes('--unlock')) return unlock();
    if (process.argv.includes('--lock')) return lock();
    let input = '';
    try {
        input = fs.readFileSync(0, 'utf8');
    } catch {
        return;
    }
    let data = {};
    try {
        data = JSON.parse(input);
    } catch {
        return;
    }
    const fp = (data.tool_input && data.tool_input.file_path) || '';
    if (!fp || !GOVERNED.some(re => re.test(fp))) return;
    if (markerFresh() || registryUnlocked(data.session_id || '', fp)) return;
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason:
                    `Governance surface: ${fp}\n` +
                    'Direct edits are forbidden (rule: governed-edits-require-skill). ' +
                    'Invoke /edit-governance — it scopes, edits, and reviews the change, ' +
                    'and grants a 2h unlock via `node ~/.claude/hooks/edit-governance-guard.cjs --unlock`.',
            },
        }),
    );
}

try {
    main();
} catch {
    /* fail open */
}
