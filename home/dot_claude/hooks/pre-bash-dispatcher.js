#!/usr/bin/env node
'use strict';
/**
 * Consolidated PreToolUse(Bash) dispatcher.
 *
 * Reads stdin once, parses once, then runs each enabled check's run(input) in
 * order. The first check returning { exitCode: 2 } blocks the command (its
 * stderr is fed back to the agent). A check that throws also blocks.
 *
 * Toggle any check without editing settings.json:
 *   HOOKS_DISABLED=pre:bash:block-dangerous-commands
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const CHECKS = [
    'pre:bash:block-dangerous-commands',
    'pre:bash:block-dangerous-git',
    'pre:bash:gate-push-convention',
    'pre:bash:gate-commit-not-protected',
].map(id => ({
    id,
    run: input => require(`./bash-checks/${id.slice('pre:bash:'.length)}`).run(input),
}));

function runChecks(input, checks) {
    for (const check of checks) {
        if (!isHookEnabled(check.id)) continue;
        let res;
        try {
            res = check.run(input);
        } catch (err) {
            return { exitCode: 2, stderr: `[hook] ${check.id} errored: ${err && err.message}` };
        }
        if (res && res.exitCode === 2) return res;
    }
    return { exitCode: 0 };
}

async function main() {
    const raw = await readStdin();
    const res = runChecks(parseInput(raw), CHECKS);
    if (res.exitCode === 2) {
        if (res.stderr) process.stderr.write(res.stderr + '\n');
        process.exit(2);
    }
    process.stdout.write(raw);
    process.exit(0);
}

if (require.main === module)
    main().catch(err => {
        process.stderr.write(`[hook] pre-bash-dispatcher errored: ${err && err.message}\n`);
        process.exit(2);
    });

module.exports = { runChecks };
