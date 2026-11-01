'use strict';
// The Bash side of the Azure work-item ask is dcg's drew.azure_writes pack (mode
// ask). This checks its work-item rule against real command shapes using the
// pattern from the source pack; dcg refuses a swapped-in config, so the live
// binary is not driven here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PACK = path.join(__dirname, '..', '..', '..', 'dot_config', 'dcg', 'packs', 'azure-writes.yaml');

function rule(name) {
    const text = fs.readFileSync(PACK, 'utf8');
    const block = text.split(/\n  - name: /).find(b => b.startsWith(name + '\n'));
    const field = key => block.match(new RegExp(`\\n    ${key}: '?(.*?)'?(?:\\n|$)`))[1];
    return { pattern: new RegExp(field('pattern')), explanation: field('explanation') };
}

const workItem = rule('boards-work-item-write');

test('asks on a work-item create, update or comment', () => {
    for (const cmd of [
        // Real shape (id sanitised): a status comment posted through --discussion.
        'az boards work-item update --id 12345 --discussion "Verified in UAT"',
        'az boards work-item create --type Bug --title "x" --org https://dev.azure.com/org',
        'az boards work-item update --id 12345 --state Resolved',
        'az boards work-item comment add --id 12345 --text "x"',
        'az boards work-item relation add --id 1 --relation-type parent --target-id 2',
    ])
        assert.match(cmd, workItem.pattern, cmd);
});

test('work-item reads pass', () => {
    for (const cmd of ['az boards work-item show --id 12345', 'az boards query --wiql "select [System.Id] from workitems"'])
        assert.doesNotMatch(cmd, workItem.pattern, cmd);
});

test('the ask names what to do instead', () => assert.match(workItem.explanation, /instead/i));
