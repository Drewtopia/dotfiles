#!/usr/bin/env node
'use strict';
/**
 * PreCompact: snapshot git orientation (branch, status, cwd, worktree) before
 * context compaction, appended to ~/.claude/logs/pre-compact-<session>.md, so
 * the shape of in-flight work survives the compaction boundary. Never blocks
 * (we do not emit a deny decision).
 *
 * Toggle: HOOKS_DISABLED=pre:compact:snapshot
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');
const { appendGlobalLog } = require('./lib/hook-log');

const HOOK_ID = 'pre:compact:snapshot';

/**
 * Pure: a markdown snapshot section.
 * @param {{trigger:string, branch:string, status:string, cwd:string, worktree:string}} s
 */
function buildSnapshot(s, nowIso) {
    const x = s || {};
    const status = (x.status || '').trim() || '(clean)';
    return [
        `## ${nowIso} (${x.trigger || 'unknown'})`,
        '',
        `- branch: ${x.branch || '-'}`,
        `- cwd: ${x.cwd || '-'}`,
        `- worktree: ${x.worktree || '-'}`,
        '',
        '```',
        status,
        '```',
        '',
        '',
    ].join('\n');
}

/** Best-effort git orientation, merged with payload fields. */
function collect(input) {
    const i = input || {};
    const top = git(['rev-parse', '--show-toplevel']);
    return {
        trigger: i.trigger,
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || '-',
        status: git(['status', '--short']),
        cwd: i.cwd || process.cwd(),
        worktree: top ? top.split('/').pop() : '-',
    };
}

/** Per-session filename, sanitised so a hostile session_id can't escape the dir. */
function sessionFile(input) {
    const id = String((input && input.session_id) || 'unknown').replace(
        /[^a-zA-Z0-9_-]/g,
        '',
    );
    return `pre-compact-${id || 'unknown'}.md`;
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) process.exit(0);
    const input = parseInput(raw);
    appendGlobalLog(
        sessionFile(input),
        buildSnapshot(collect(input), new Date().toISOString()),
    );
    process.exit(0);
}

if (require.main === module) main();

module.exports = { buildSnapshot, sessionFile, collect, HOOK_ID };
