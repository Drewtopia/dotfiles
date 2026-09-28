'use strict';

const { getCommand } = require('../lib/hook-io');

const RM_FLAGS = '(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\\s+--force|-rf|-fr)';
// The target must end here, so `/` or `~` as the start of a longer path is not root or home.
const PATH_END = '/?(?=$|[\\s;&|)])';

// First match wins.
const RULES = [
    {
        id: 'rm-rf-sensitive-path',
        re: new RegExp(
            `rm\\s+${RM_FLAGS}\\s+(/|\\.\\.|(~|\\$HOME|\\$\\{HOME\\})(/[^/\\s;&|]+)?)${PATH_END}`,
        ),
        msg: cmd =>
            `🛑 BLOCKED: Destructive rm command targeting root, home, a folder directly in home, or parent directory\nCommand: ${cmd}`,
    },
    {
        id: 'rm-rf-wildcard',
        re: new RegExp(`rm\\s+${RM_FLAGS}\\s+(/\\*|~/\\*|\\$HOME/\\*|\\$\\{HOME\\}/\\*|/home(/[^/\\s;&|]+)?${PATH_END})`),
        msg: cmd =>
            `🛑 BLOCKED: Destructive rm command with wildcard on sensitive path\nCommand: ${cmd}`,
    },
    {
        id: 'force-push-protected',
        re: /git\s+push\s+[^;&|\n]*(-f|--force)\s+[^;&|\n]*(main|master|production|release)/,
        msg: cmd =>
            `🛑 BLOCKED: Force push to protected branch\nCommand: ${cmd}\nTip: Create a PR instead of force pushing to main/master`,
    },
    {
        id: 'chmod-777',
        re: /chmod\s+(777|a\+rwx)/,
        msg: cmd =>
            `⚠️ BLOCKED: Setting world-writable permissions (777)\nCommand: ${cmd}\nTip: Use 755 for directories, 644 for files`,
    },
    {
        id: 'curl-pipe-shell',
        re: /curl\s+.*\|\s*(ba)?sh/,
        msg: cmd =>
            `⚠️ BLOCKED: Piping curl output directly to shell\nCommand: ${cmd}\nTip: Download script first, review it, then execute`,
    },
    {
        id: 'wget-pipe-shell',
        re: /wget\s+.*\|\s*(ba)?sh/,
        msg: cmd =>
            `⚠️ BLOCKED: Piping wget output directly to shell\nCommand: ${cmd}`,
    },
    {
        id: 'dd-to-disk',
        re: /dd\s+.*of=\/dev\/(sd|hd|nvme|disk)/,
        msg: cmd =>
            `🛑 BLOCKED: dd command writing directly to disk device\nCommand: ${cmd}`,
    },
    {
        id: 'mkfs',
        re: /mkfs/,
        msg: cmd =>
            `🛑 BLOCKED: mkfs command (disk formatting)\nCommand: ${cmd}`,
    },
    {
        id: 'exfiltrate-sensitive',
        re: /\b(curl|wget|nc|netcat)\s+[^;&|\n]*\.(env|pem|key|secret)/,
        msg: cmd =>
            `⚠️ BLOCKED: Command appears to exfiltrate sensitive files\nCommand: ${cmd}`,
    },
    {
        id: 'read-env-posix',
        re: /\b(cat|less|head|tail|more|bat)\s+[^;&|\n]*\.env/,
        msg: cmd =>
            `⚠️ BLOCKED: Reading .env file via ${cmd}\nTip: Use environment variables instead of reading .env directly`,
    },
    {
        id: 'ps-remove-item-recurse-force',
        re: /Remove-Item.*-Recurse.*-Force|Remove-Item.*-Force.*-Recurse/i,
        msg: cmd =>
            `🛑 BLOCKED: PowerShell recursive forced delete (Remove-Item -Recurse -Force)\nCommand: ${cmd}`,
    },
    {
        id: 'ps-pipe-iex',
        re: /(curl|iwr|Invoke-WebRequest).*\|\s*(iex|Invoke-Expression)/i,
        msg: cmd =>
            `⚠️ BLOCKED: Piping web output to Invoke-Expression\nCommand: ${cmd}\nTip: download to file first, review, then dot-source or run explicitly`,
    },
    {
        id: 'ps-iwr-exfiltrate',
        re: /(Invoke-WebRequest|iwr)\s+.*\.(env|pem|key|secret)/i,
        msg: cmd =>
            `⚠️ BLOCKED: Invoke-WebRequest appears to exfiltrate sensitive file\nCommand: ${cmd}`,
    },
    {
        id: 'ps-get-content-env',
        re: /Get-Content\s+.*\.env/i,
        msg: cmd =>
            `⚠️ BLOCKED: Reading .env file via Get-Content\nTip: Use environment variables instead of reading .env directly`,
    },
];

function run(input) {
    const cmd = getCommand(input);
    if (!cmd) return { exitCode: 0 };
    for (const rule of RULES) {
        if (rule.re.test(cmd)) {
            return { exitCode: 2, stderr: rule.msg(cmd) };
        }
    }
    return { exitCode: 0 };
}

module.exports = { run, RULES };
