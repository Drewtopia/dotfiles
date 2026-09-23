#!/usr/bin/env node
'use strict';

const { readStdin, parseInput, getCommand } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'post:bash:commit-clear-nudge';
// A HEAD commit older than this was not made by the command that just ran.
const FRESH_SECONDS = 120;
const GIT_COMMIT = /(?:^|[\s/"'(])git(?:\s+-[Cc]\s+\S+)*\s+commit(?=\s|$|["')])/;

const done = () => process.exit(0);

function runsGitCommit(command) {
    return String(command || '')
        .split(/&&|\|\||[;|\n]/)
        .some(part => GIT_COMMIT.test(part.trim()));
}

function freshCommit(logLine, nowSeconds) {
    const [epoch, sha, ...subject] = String(logLine || '').split('\t');
    const committed = Number(epoch);
    if (!sha || !epoch || !Number.isFinite(committed)) return null;
    if (nowSeconds - committed > FRESH_SECONDS) return null;
    return { sha, subject: subject.join('\t') };
}

function noticeFor(commit) {
    return [
        `Commit checkpoint — ${commit.sha} "${commit.subject}" is on the branch, so that work no longer depends on this context window.`,
        'If what comes next is a separate piece of work, tell the user in one line that this is a good point to /clear, and give a one-line prompt to resume with that names the branch, PR, or issue.',
        'If the next step continues the same piece, say nothing about /clear.',
    ].join('\n');
}

async function main() {
    if (!isHookEnabled(HOOK_ID)) return done();

    const input = parseInput(await readStdin());
    if (!runsGitCommit(getCommand(input))) return done();

    const cwd = input.cwd || process.cwd();
    const commit = freshCommit(
        git(['-C', cwd, 'log', '-1', '--format=%ct%x09%h%x09%s']),
        Math.floor(Date.now() / 1000),
    );
    if (!commit) return done();

    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: noticeFor(commit),
            },
        }),
    );
    done();
}

if (require.main === module) main().catch(done);

module.exports = { runsGitCommit, freshCommit, noticeFor, FRESH_SECONDS };
