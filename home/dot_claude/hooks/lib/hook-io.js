'use strict';

const MAX_STDIN = 1024 * 1024;

function readStdin(maxBytes = MAX_STDIN) {
    return new Promise(resolve => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
            if (data.length < maxBytes) {
                data += chunk.substring(0, maxBytes - data.length);
            }
        });
        process.stdin.on('end', () => resolve(data));
    });
}

function parseInput(raw) {
    try {
        return raw && raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function getCommand(input) {
    return String(input?.tool_input?.command || '');
}

module.exports = { MAX_STDIN, readStdin, parseInput, getCommand };
