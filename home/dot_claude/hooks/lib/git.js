'use strict';
// Errors return '' so a hook outside a repo, or without git, degrades to "allow".

const { execFileSync } = require('node:child_process');

function git(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

const REV_PARSE_BRANCH = ['rev-parse', '--abbrev-ref', 'HEAD'];

const currentBranch = cwd => git(cwd ? ['-C', cwd, ...REV_PARSE_BRANCH] : REV_PARSE_BRANCH);
const REV_PARSE_ROOT = ['rev-parse', '--show-toplevel'];
const repoRoot = cwd => git(cwd ? ['-C', cwd, ...REV_PARSE_ROOT] : REV_PARSE_ROOT);

module.exports = { git, currentBranch, repoRoot };
