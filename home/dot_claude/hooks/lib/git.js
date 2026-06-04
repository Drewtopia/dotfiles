'use strict';
/**
 * Thin git helpers for hook checks. All swallow errors and return '' so a hook
 * outside a repo (or with git unavailable) degrades to "allow", matching the
 * original .sh behavior where `git ... 2>/dev/null` produced an empty string.
 *
 * Uses execFileSync with an argument array (no shell) — no command-injection
 * surface even though current callers pass only constant args.
 */

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

const currentBranch = () => git(['rev-parse', '--abbrev-ref', 'HEAD']);
const repoRoot = () => git(['rev-parse', '--show-toplevel']);

module.exports = { git, currentBranch, repoRoot };
