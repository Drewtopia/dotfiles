'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('../work-safety-ask.js');

const decision = (tool_name, tool_input = {}) => decide({ tool_name, tool_input });

test('asks before creating an artifact', () => {
    // Real call shape (path sanitised): an unrequested HTML map published from a scratchpad.
    const out = decision('Artifact', { file_path: '<scratchpad>/automation-map.html', label: 'automation map' });
    assert.equal(out.permissionDecision, 'ask');
    assert.match(out.permissionDecisionReason, /instead/i);
});

test('reading, listing or updating an existing artifact does not ask', () => {
    for (const input of [
        { action: 'read', url: 'https://claude.ai/artifact/abc' },
        { action: 'list' },
        { action: 'quickstart', intent: 'other' },
        { url: 'https://claude.ai/artifact/abc', file_path: '<scratchpad>/session-loop.html' },
    ])
        assert.equal(decision('Artifact', input), null, JSON.stringify(input));
});

test('a new version of an artifact made earlier this session does not ask again', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-'));
    const transcript = path.join(dir, 't.jsonl');
    const page = '/tmp/scratch/automation-map.html';
    const toolUse = (id, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Artifact', input }] } });
    // The transcript may already hold the call being decided; it is not an earlier version.
    const write = (...entries) => fs.writeFileSync(transcript, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
    const first = { tool_name: 'Artifact', tool_use_id: 'tu1', tool_input: { file_path: page, icon: 'map' }, transcript_path: transcript };
    write(toolUse('tu1', first.tool_input));
    assert.equal(decide(first).permissionDecision, 'ask');

    const v2 = { tool_name: 'Artifact', tool_use_id: 'tu2', tool_input: { file_path: page, label: 'v2' }, transcript_path: transcript };
    const result = (id, extra = {}) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'published', ...extra }] } });
    write(toolUse('tu1', first.tool_input), result('tu1'), toolUse('tu2', v2.tool_input));
    assert.equal(decide(v2), null);
    const other = { ...v2, tool_input: { file_path: '/tmp/scratch/other.html' } };
    assert.equal(decide(other).permissionDecision, 'ask');

    // Without its own id the call being decided could be the earlier one.
    const { tool_use_id, ...noId } = v2;
    assert.equal(decide(noId).permissionDecision, 'ask');

    // An earlier call counts only once it published: a result that is not an error or denial.
    write(toolUse('tu1', first.tool_input), toolUse('tu2', v2.tool_input));
    assert.equal(decide(v2).permissionDecision, 'ask');
    write(toolUse('tu1', first.tool_input), result('tu1', { is_error: true, content: 'denied' }), toolUse('tu2', v2.tool_input));
    assert.equal(decide(v2).permissionDecision, 'ask');
    fs.rmSync(dir, { recursive: true });
});

test('asks before creating a Claude Doc', () => {
    // The doc-birth call the Docs server tells agents to send first (title sanitised).
    const birth = { container: { kind: 'project', create: { name: 'Workflow review', doc: { markdown: '# Workflow review' } } }, batch: [] };
    const out = decision('mcp__claude_ai_Claude_Docs__batch', birth);
    assert.equal(out.permissionDecision, 'ask');
    assert.match(out.permissionDecisionReason, /instead/i);
});

test('reading or editing an existing Claude Doc does not ask', () => {
    const doc = { kind: 'project', id: '713d74b8' };
    assert.equal(decision('mcp__claude_ai_Claude_Docs__read', { container: doc }), null);
    assert.equal(decision('mcp__claude_ai_Claude_Docs__guide', { items: ['topic.index'] }), null);
    // Real call (ids shortened): a batch that edits a doc that already exists.
    assert.equal(decision('mcp__claude_ai_Claude_Docs__batch', { container: doc, batch: [{ verb: 'update' }] }), null);
    // `create` adds a tab or comment inside an existing doc.
    assert.equal(decision('mcp__claude_ai_Claude_Docs__create', { container: doc, object: 'utterance', payload: {} }), null);
});

// Tool names from the Azure DevOps MCP server: the consolidated ones already in
// permissions.ask, and the older per-action ones agents also meet.
test('asks before an Azure work-item create, update or comment through MCP', () => {
    for (const tool of [
        'mcp__azure-devops__wit_work_item_write',
        'mcp__azure-devops__wit_work_item_comment_write',
        'mcp__azure-devops__wit_create_work_item',
        'mcp__azure-devops__wit_update_work_item',
        'mcp__azure-devops__wit_update_work_items_batch',
        'mcp__azure-devops__wit_add_work_item_comment',
        'mcp__ado__wit_add_child_work_items',
    ]) {
        const out = decision(tool, { id: 12345, fields: [] });
        assert.equal(out?.permissionDecision, 'ask', tool);
        assert.match(out.permissionDecisionReason, /draft/i, tool);
    }
});

test('reading Azure work items through MCP does not ask', () => {
    for (const tool of [
        'mcp__azure-devops__wit_get_work_item',
        'mcp__azure-devops__wit_get_work_items_batch_by_ids',
        'mcp__azure-devops__wit_list_work_item_comments',
        'mcp__azure-devops__wit_work_item_read',
        'mcp__azure-devops__core_list_projects',
    ])
        assert.equal(decision(tool, { id: 12345 }), null, tool);
});
