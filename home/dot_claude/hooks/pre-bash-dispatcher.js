#!/usr/bin/env node
'use strict';
/**
 * Consolidated PreToolUse(Bash) dispatcher.
 *
 * Reads stdin ONCE, parses ONCE, then runs each enabled check's run(input) in
 * order. First check returning { exitCode: 2 } blocks the command (its stderr
 * is fed back to the agent). Replaces N separate Bash hook entries in
 * settings.json with one process.
 *
 * Toggle any check without editing settings.json:
 *   HOOKS_DISABLED=pre:bash:block-dangerous-commands
 *
 * Pilot scope: only block-dangerous-commands is ported. The git checks remain
 * wired as their own .sh entries until ported here too.
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

/** Ordered check registry. id -> module exporting run(input). */
const CHECKS = [
    {
        id: 'pre:bash:block-dangerous-commands',
        mod: './bash-checks/block-dangerous-commands',
    },
    {
        id: 'pre:bash:block-dangerous-git',
        mod: './bash-checks/block-dangerous-git',
    },
    {
        id: 'pre:bash:gate-push-convention',
        mod: './bash-checks/gate-push-convention',
    },
];

async function main() {
    const raw = await readStdin();
    const input = parseInput(raw);

    for (const check of CHECKS) {
        if (!isHookEnabled(check.id)) continue;

        let res;
        try {
            res = require(check.mod).run(input);
        } catch (err) {
            // A crashing safety check must not silently allow the command through.
            // Surface the error and continue to the remaining checks.
            process.stderr.write(
                `[hook] ${check.id} errored: ${err && err.message}\n`,
            );
            continue;
        }

        if (res && res.exitCode === 2) {
            if (res.stderr) process.stderr.write(res.stderr + '\n');
            process.exit(2);
        }
    }

    // Allow: echo stdin back for any downstream consumer.
    process.stdout.write(raw);
    process.exit(0);
}

main();
