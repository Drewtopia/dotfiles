#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit: scope-drift check.
 *
 * Names work that wandered off the session's stated scope while it is still
 * uncommitted, rather than leaving it for review. Resolves an anchor (the
 * session's open tasks, else the opening ask), then asks the model to compare
 * its uncommitted diff against it.
 *
 * Injects via hookSpecificOutput.additionalContext: the model is the one that
 * must judge the diff, and Stop supports only decision:"block" — which would
 * make an advisory check blocking. Never blocks; always exits 0.
 *
 * Toggle: HOOKS_DISABLED=prompt:submit:drift-check
 */

const fs = require('node:fs');
const path = require('node:path');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');
const { git } = require('./lib/git');

const HOOK_ID = 'prompt:submit:drift-check';
const MAX_FILES = 40;

const done = () => process.exit(0);

/** Open tasks for this session. Empty when none are tracked. */
function tasksAnchor(sessionId) {
    if (!sessionId) return '';
    const dir = path.join(
        process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || '', '.claude'),
        'tasks',
        String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_'),
    );
    let entries;
    try {
        entries = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
        return '';
    }
    const open = [];
    for (const file of entries) {
        try {
            const task = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (task.status === 'completed') continue;
            const subject = String(task.subject || '').trim();
            if (subject) open.push(`- ${subject}`);
        } catch {
            /* a half-written task file is not a reason to fail the turn */
        }
    }
    return open.join('\n');
}

/**
 * The opening ask. A session started with a slash command has an injected
 * skill payload as message one, so prefer its ARGUMENTS: line — that is the
 * part the user actually typed.
 */
function transcriptAnchor(transcriptPath) {
    if (!transcriptPath) return '';
    let lines;
    try {
        lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    } catch {
        return '';
    }
    for (const line of lines) {
        if (!line.trim()) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry.type !== 'user') continue;
        const content = entry.message?.content;
        const text = (
            typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content.map(b => (b && b.text) || '').join(' ')
                  : ''
        ).trim();
        if (!text) continue;
        const args = text.match(/^ARGUMENTS:\s*(.+)$/m);
        if (args) return args[1].trim();
        if (text.startsWith('<')) continue;
        return text.slice(0, 600);
    }
    return '';
}

function buildNotice(anchor, files) {
    return [
        'Scope check — the working tree has uncommitted changes.',
        '',
        'This session is for:',
        anchor,
        '',
        'Changed files:',
        files,
        '',
        'Compare the diff against that scope. Report deviations only, one line each:',
        '- files outside what the scope implies',
        '- an abstraction, interface, or config nobody asked for',
        '- refactor-in-passing: tidying code the task only reads',
        '- a newly added dependency',
        '',
        'Adjacent root-cause fixes and added tests, docs, and comments are in scope —',
        'the ponytail and comment rules require them. Leave them unremarked.',
        "Report either party's drift, the user's own mid-session widening included.",
        'When the diff matches the scope, stay silent about scope entirely.',
    ].join('\n');
}

async function main() {
    if (!isHookEnabled(HOOK_ID)) return done();

    const input = parseInput(await readStdin());
    const cwd = input.cwd || process.cwd();

    // Untracked files are drift too, and `diff HEAD` cannot see them.
    const changed = [
        git(['-C', cwd, 'diff', 'HEAD', '--name-only']),
        git(['-C', cwd, 'ls-files', '--others', '--exclude-standard']),
    ]
        .filter(Boolean)
        .join('\n');
    if (!changed) return done();

    const anchor = tasksAnchor(input.session_id) || transcriptAnchor(input.transcript_path);
    if (!anchor) return done();

    const all = changed.split('\n').filter(Boolean);
    const shown = all.slice(0, MAX_FILES).map(f => `- ${f}`);
    if (all.length > MAX_FILES) shown.push(`- …and ${all.length - MAX_FILES} more`);

    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'UserPromptSubmit',
                additionalContext: buildNotice(anchor, shown.join('\n')),
            },
        }),
    );
    done();
}

main().catch(done);
