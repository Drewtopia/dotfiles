'use strict';
// A session transcript is JSONL: one entry per line. A missing or unreadable file reads
// as no entries, and a line that is not JSON is skipped.

const fs = require('node:fs');

/** The parsed entries of the transcript at `file`. */
function transcriptEntries(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        return [];
    }
    const entries = [];
    for (const line of text.split('\n')) {
        try {
            entries.push(JSON.parse(line));
        } catch {
            /* a partial or blank line */
        }
    }
    return entries;
}

module.exports = { transcriptEntries };
