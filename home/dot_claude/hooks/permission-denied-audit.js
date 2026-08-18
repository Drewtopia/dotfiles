#!/usr/bin/env node
'use strict';
/**
 * PermissionDenied: append an audit line when auto mode denies a tool call, to
 * <repo>/.claude/logs/permission-denied.log (self-ignoring). A read-only record
 * of what got blocked, for debugging denials across concurrent sessions. Never
 * blocks and never retries the call.
 *
 * Toggle: HOOKS_DISABLED=permission:denied:audit
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { appendProjectLog } = require('./lib/hook-log');

const HOOK_ID = 'permission:denied:audit';
const MAX_FIELD = 200;

const summarize = v => {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.replace(/\s+/g, ' ').slice(0, MAX_FIELD);
};

/** Pure: one TSV audit line from the PermissionDenied payload. */
function formatAuditLine(input, nowIso) {
    const i = input || {};
    return [
        nowIso,
        i.session_id || '-',
        i.tool_name || '-',
        summarize(i.decision_reason) || '-',
        summarize(i.tool_input) || '-',
    ].join('\t');
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) process.exit(0);
    const line = formatAuditLine(parseInput(raw), new Date().toISOString());
    appendProjectLog('permission-denied.log', line);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { formatAuditLine, HOOK_ID };
