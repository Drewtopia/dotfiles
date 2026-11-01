#!/usr/bin/env node
'use strict';
// gap: permissions.ask matches a tool name only; it cannot tell a doc birth from an edit in the same `batch` tool, nor say what to do instead.
// PreToolUse(Artifact|Claude Docs|Azure DevOps MCP): asks Drew before an agent
// creates an artifact or Claude Doc, or writes to an Azure work item. Reads pass.
// An ask in a `claude -p` run with no one to answer is denied by Claude Code, and
// the reason reaches the agent.

const fs = require('node:fs');
const { readStdin, parseInput } = require('./lib/hook-io');

function ask(reason) {
    return { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason };
}

// Whether an earlier Artifact call in this session published `filePath`. The
// transcript can already hold the call being decided, so its id is skipped.
function publishedBefore(input, filePath) {
    if (!filePath || !input?.transcript_path) return false;
    let lines;
    try {
        lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n');
    } catch {
        return false;
    }
    return lines.some(line => {
        if (!line.includes('"Artifact"')) return false;
        try {
            return JSON.parse(line).message.content.some(
                c =>
                    c?.type === 'tool_use' &&
                    c.name === 'Artifact' &&
                    c.id !== input.tool_use_id &&
                    c.input?.file_path === filePath,
            );
        } catch {
            return false;
        }
    });
}

function decide(input) {
    const tool = String(input?.tool_name || '');
    const args = input?.tool_input || {};

    const artifactRead = args.url || ['read', 'list', 'quickstart'].includes(args.action);
    if (tool === 'Artifact' && !artifactRead && !publishedBefore(input, args.file_path))
        return ask(
            'Creating an artifact: did Drew ask for one? If not, put the content in your reply ' +
                'or a local file instead, and offer the artifact in one line.',
        );

    // A doc is born by a `batch` (or `create`) whose container names no existing doc.
    if (/^mcp__claude_ai_Claude_Docs__(?:batch|create)$/.test(tool) && (args.container?.create || !args.container?.id))
        return ask(
            'Creating a Claude Doc: did Drew ask for one? If not, put the content in your reply ' +
                'or a local file instead, and offer the doc in one line.',
        );

    // Matched by verb, not by a name list: the server has renamed its tools before.
    if (/^mcp__.+__wit_\w*(?:create|update|write|add|link|comment)/.test(tool) && !/__wit_(?:list|get)_/.test(tool))
        return ask(
            'Azure work-item write: the board is the team\'s, and Drew writes there. Instead, draft the ' +
                'change (fields, comment text) in your reply for Drew to post or approve.',
        );

    return null;
}

async function main() {
    const out = decide(parseInput(await readStdin()));
    if (out) process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
    process.exit(0);
}

if (require.main === module)
    main().catch(err => {
        process.stderr.write(`[hook] work-safety-ask errored: ${err && err.message}\n`);
        process.exit(2);
    });

module.exports = { decide };
