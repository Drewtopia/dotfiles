#!/usr/bin/env node
'use strict';
/**
 * Live-session registry + WARN-ONLY collision detector. Wired to SessionStart
 * (presence) and PreToolUse Edit|Write|MultiEdit (heartbeat + warn).
 *
 * The worktree collision map (collision-map-build/collision-warn) keys files by
 * worktree BRANCH, so N sessions in the same checkout on the same branch are
 * indistinguishable to it and collide silently. This fixes that blind spot:
 * every session records itself to
 *   <git-common-dir>/sessions/<session-id>.json  = { id, toplevel, branch,
 *     startedAt, updated, files[] }
 * SessionStart writes the record; each edit appends the touched file and
 * refreshes `updated` (the heartbeat). Before an edit, warn if another LIVE
 * session (heartbeat < 30 min) is touching the same file or area.
 *
 * "Closed" is DERIVED, not an event: Claude Code has no SessionEnd hook, so a
 * session is "live" while fresh and "closed" once it stops heartbeating. Records
 * are KEPT as an audit trail and pruned only after 30 days (not deleted on end).
 *
 * Never blocks. Fails open on any error. Liveness = heartbeat freshness (mtime),
 * not pid — hook pids are not session pids and WSL process trees lie.
 *
 * The edit-governance guard (edit-governance-guard.cjs) stores its per-session
 * unlock as an additive `governanceUnlockUntil` field on these same records;
 * upsertSelf preserves any unknown fields so that write is not clobbered.
 *
 * Toggle: HOOKS_DISABLED=pretooluse:session-registry
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FRESH_MS = 30 * 60 * 1000; // a session is "live" if it heartbeat within 30 min
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000; // keep records 30 days, then prune (audit trail)
const MAX_FILES = 50; // cap the per-session touched-file list

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

/** Allow the tool (PreToolUse), optionally attaching context for the model. */
function allow(context) {
    const out = {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    };
    if (context) out.hookSpecificOutput.additionalContext = context;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
}

/** Silent no-op exit (for SessionStart, or when there's nothing to do). */
function done() {
    process.exit(0);
}

/**
 * Resolve the git repo containing `dir`.
 * @returns {{toplevel:string, branch:string, commonDir:string}|null}
 */
function resolveRepo(dir) {
    try {
        return {
            toplevel: git(['rev-parse', '--show-toplevel'], dir),
            branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], dir),
            commonDir: git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir),
        };
    } catch {
        return null;
    }
}

/** Ensure the sessions dir exists and prune records older than RETAIN_MS. */
function ensureRegDir(commonDir, now) {
    const regDir = path.join(commonDir, 'sessions');
    fs.mkdirSync(regDir, { recursive: true });
    let entries = [];
    try {
        entries = fs.readdirSync(regDir);
    } catch {
        return regDir;
    }
    for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        const p = path.join(regDir, name);
        try {
            if (now - fs.statSync(p).mtimeMs > RETAIN_MS) fs.unlinkSync(p);
        } catch {
            /* ignore */
        }
    }
    return regDir;
}

/**
 * Read + upsert this session's record, preserving startedAt, prior files, and
 * any unknown fields other tools wrote (e.g. governanceUnlockUntil).
 */
function upsertSelf(regDir, { sessionId, toplevel, branch, now, addFile }) {
    const selfPath = path.join(regDir, `${sessionId}.json`);
    let self = { id: sessionId, toplevel, branch, startedAt: now, files: [] };
    try {
        const prev = JSON.parse(fs.readFileSync(selfPath, 'utf8'));
        if (prev && typeof prev === 'object')
            self = { ...prev, ...self, startedAt: prev.startedAt || now };
        if (!Array.isArray(self.files)) self.files = [];
    } catch {
        /* first write this session */
    }
    self.id = sessionId;
    self.toplevel = toplevel;
    self.branch = branch;
    self.updated = now;
    if (addFile) self.files = [...self.files.filter(f => f !== addFile), addFile].slice(-MAX_FILES);
    try {
        fs.writeFileSync(selfPath, JSON.stringify(self));
    } catch {
        /* best effort */
    }
}

/**
 * Pure decision: given the file being edited and the other live sessions'
 * touched-file lists, return the warning string (or null for no warning).
 * Exact-file collision beats same-area overlap.
 * @param {{rel:string, relDir:string, areaOk:boolean,
 *   others:{label:string, files:string[]}[]}} arg
 * @returns {string|null}
 */
function buildWarning({ rel, relDir, areaOk, others }) {
    const exact = new Set(); // labels touching the exact file
    const nearby = new Map(); // label -> Set(basename) in the same dir
    for (const { label, files } of others) {
        for (const f of files) {
            if (f === rel) exact.add(label);
            else if (areaOk && path.dirname(f) === relDir) {
                if (!nearby.has(label)) nearby.set(label, new Set());
                nearby.get(label).add(path.basename(f));
            }
        }
    }
    if (exact.size) {
        return (
            `⚠️ LIVE COLLISION: ${rel} is being edited RIGHT NOW by another session:\n` +
            [...exact].map(o => `   • session ${o}`).join('\n') +
            `\nAnother Claude session touched this exact file within the last 30 min. ` +
            `Coordinate before editing — you may clobber each other's work. (Warning only; edit allowed.)`
        );
    }
    if (nearby.size) {
        return (
            `⚠️ LIVE NEARBY WORK: ${relDir}/ is being changed by another live session:\n` +
            [...nearby.entries()]
                .map(
                    ([label, files]) =>
                        `   • session ${label} — e.g. ${[...files].slice(0, 3).join(', ')}`,
                )
                .join('\n') +
            `\nAnother session is working in the same area right now — likely similar work. ` +
            `Check before diverging. (Warning only; edit allowed.)`
        );
    }
    return null;
}

/** SessionStart: register presence. No warning, silent exit. */
function handleStart(payload, now) {
    const repo = resolveRepo(payload.cwd || process.cwd());
    if (!repo || !payload.session_id) return done();
    const regDir = ensureRegDir(repo.commonDir, now);
    upsertSelf(regDir, {
        sessionId: payload.session_id,
        toplevel: repo.toplevel,
        branch: repo.branch,
        now,
    });
    return done();
}

/** PreToolUse edit: heartbeat this file and warn on live collisions. */
function handleEdit(payload, now) {
    const sessionId = payload.session_id;
    const filePath = payload.tool_input?.file_path;
    if (!sessionId || !filePath) return allow();

    const repo = resolveRepo(path.dirname(filePath));
    if (!repo) return allow(); // not a git repo — nothing to coordinate against
    const rel = path.relative(repo.toplevel, filePath);
    const relDir = path.dirname(rel);
    // Same "area" only when specific enough (2+ path segments), matching collision-warn.
    const areaOk = relDir !== '.' && relDir.split('/').length >= 2;

    let regDir;
    try {
        regDir = ensureRegDir(repo.commonDir, now);
    } catch {
        return allow();
    }

    // Read other LIVE sessions (fresh heartbeat) before recording our own edit.
    const others = [];
    let entries = [];
    try {
        entries = fs.readdirSync(regDir);
    } catch {
        /* ignore */
    }
    for (const name of entries) {
        if (!name.endsWith('.json') || name === `${sessionId}.json`) continue;
        const p = path.join(regDir, name);
        try {
            if (now - fs.statSync(p).mtimeMs > FRESH_MS) continue; // stale = closed, don't warn
        } catch {
            continue;
        }
        let other;
        try {
            other = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
            continue; // half-written or corrupt
        }
        if (!Array.isArray(other.files)) continue;
        const label = `${other.id?.slice(0, 8) || '????????'} (${other.branch || '?'})`;
        others.push({ label, files: other.files });
    }

    upsertSelf(regDir, {
        sessionId,
        toplevel: repo.toplevel,
        branch: repo.branch,
        now,
        addFile: rel,
    });

    return allow(buildWarning({ rel, relDir, areaOk, others }));
}

function main() {
    if ((process.env.HOOKS_DISABLED || '').includes('pretooluse:session-registry')) return done();

    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    } catch {
        return done();
    }
    const now = Date.now();
    if (payload.hook_event_name === 'SessionStart') return handleStart(payload, now);
    return handleEdit(payload, now); // PreToolUse Edit|Write|MultiEdit
}

if (require.main === module) {
    try {
        main();
    } catch {
        done();
    }
}

module.exports = { buildWarning };
