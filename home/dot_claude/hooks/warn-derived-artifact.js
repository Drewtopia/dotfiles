#!/usr/bin/env node
'use strict';
/**
 * PostToolUse(Read): when a derived artifact is read — a summary, handoff note,
 * plan, or memory file — remind the model that the file is a claim, not a
 * canonical source. Enforces the "verify, don't trust" rule at the moment of
 * contact with the stale document.
 *
 * Injects via hookSpecificOutput.additionalContext (reaches the model's
 * context); systemMessage would only reach the user, who is not the one about
 * to cite the file. Never blocks — always exits 0.
 *
 * Toggle: HOOKS_DISABLED=post:read:derived-artifact
 */

const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'post:read:derived-artifact';

/** Files whose name alone marks them as a summary of something else. */
const DERIVED_BASENAME = /^(memory|session_log|handoff[\w-]*)\.md$/i;

/** Directories whose .md contents are summaries: plans/ and the memory store. */
const DERIVED_DIR = /\/(plans|\.claude\/memory)\/.+\.md$/i;

const NOTICE = [
    'Derived artifact — this file is a claim, not a canonical source.',
    'It was written against a branch, commit, and set of files that may have moved since.',
    'Before citing or acting on anything in it: re-read the files it names, re-fetch the URLs it cites, and confirm they still match.',
    'State "verified against X", or flag the claim as unverified.',
].join(' ');

function isDerived(filePath) {
    if (!filePath) return false;
    const normalized = String(filePath).replace(/\\/g, '/');
    const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
    return DERIVED_BASENAME.test(basename) || DERIVED_DIR.test(normalized);
}

/** Pure: the context to inject for a read path, or '' when none is warranted. */
function noticeFor(filePath) {
    return isDerived(filePath) ? NOTICE : '';
}

function extractFilePath(input) {
    const ti = (input && input.tool_input) || {};
    return ti.file_path || ti.path || '';
}

async function main() {
    const raw = await readStdin();
    if (!isHookEnabled(HOOK_ID)) {
        process.stdout.write(raw);
        process.exit(0);
    }
    let notice = '';
    try {
        notice = noticeFor(extractFilePath(parseInput(raw)));
    } catch {
        notice = '';
    }
    if (notice) {
        process.stdout.write(
            JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    additionalContext: notice,
                },
            }),
        );
    } else {
        process.stdout.write(raw);
    }
    process.exit(0);
}

if (require.main === module) main();

module.exports = {
    noticeFor,
    isDerived,
    extractFilePath,
    NOTICE,
    HOOK_ID,
    DERIVED_BASENAME,
    DERIVED_DIR,
};
