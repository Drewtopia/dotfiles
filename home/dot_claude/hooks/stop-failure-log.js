#!/usr/bin/env node
'use strict';
/**
 * StopFailure: append a line when a turn dies on an API error (rate_limit,
 * overloaded, server_error, ...) to <repo>/.claude/logs/stop-failure.log.
 * These turn-deaths are otherwise silent; this leaves a timestamped trail.
 * Claude Code ignores this event's stdout/exit code, so it only writes the log.
 *
 * Toggle: HOOKS_DISABLED=stop:failure:log
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { appendProjectLog } = require('./lib/hook-log');

const HOOK_ID = 'stop:failure:log';

/** Pure: one TSV line from the StopFailure payload. */
function formatFailureLine(input, nowIso) {
    const i = input || {};
    const msg = String(i.error_message || '')
        .replace(/\s+/g, ' ')
        .slice(0, 300);
    return [nowIso, i.session_id || '-', i.error_type || 'unknown', msg || '-'].join(
        '\t',
    );
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) process.exit(0);
    const line = formatFailureLine(parseInput(raw), new Date().toISOString());
    appendProjectLog('stop-failure.log', line);
    process.exit(0);
}

if (require.main === module) main();

module.exports = { formatFailureLine, HOOK_ID };
