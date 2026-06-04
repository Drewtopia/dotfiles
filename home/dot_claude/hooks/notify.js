#!/usr/bin/env node
'use strict';
/**
 * Notification: desktop alert when Claude needs attention.
 * Faithful port of notify.sh — content extract + 100-char truncate, then an
 * OS-dispatched notification (macOS osascript / Linux notify-send / WSL toast /
 * terminal bell fallback). Always exits 0.
 *
 * Toggle: HOOKS_DISABLED=notification:desktop-notify
 */

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { readStdin, parseInput } = require('./lib/hook-io');
const { isHookEnabled } = require('./lib/hook-flags');

const HOOK_ID = 'notification:desktop-notify';
const TITLE = 'Claude Code';
const MAX_LEN = 100;

/** Extract notification text, defaulting + truncating exactly as notify.sh did. */
function parseContent(input) {
    let content = (input && input.content) || 'Claude needs your attention';
    content = String(content);
    if (content.length > MAX_LEN) content = content.slice(0, MAX_LEN) + '...';
    return content;
}

function isWSL() {
    try {
        return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
    } catch {
        return false;
    }
}

function notify(message) {
    if (process.platform === 'darwin') {
        try {
            spawnSync(
                'osascript',
                [
                    '-e',
                    `display notification "${message}" with title "${TITLE}" sound name "Glass"`,
                ],
                { stdio: 'ignore' },
            );
        } catch {
            /* ignore */
        }
        return;
    }

    // Linux with notify-send
    const ns = spawnSync(
        'notify-send',
        [TITLE, message, '-u', 'normal', '-t', '5000'],
        {
            stdio: 'ignore',
        },
    );
    if (!ns.error) return;

    // Windows / WSL toast
    if (isWSL()) {
        const ps = `
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
            $template = '<toast><visual><binding template="ToastText02"><text id="1">${TITLE}</text><text id="2">${message}</text></binding></visual></toast>'
            $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            $xml.LoadXml($template)
            $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show($toast)`;
        try {
            spawnSync('powershell.exe', ['-Command', ps], { stdio: 'ignore' });
        } catch {
            /* ignore */
        }
        return;
    }

    // Fallback: terminal bell
    process.stdout.write('');
}

async function main() {
    const raw = await readStdin();
    const input = parseInput(raw);
    if (isHookEnabled(HOOK_ID)) {
        try {
            notify(parseContent(input));
        } catch {
            /* notifications must never block */
        }
    }
    process.exit(0);
}

if (require.main === module) main();

module.exports = { parseContent, notify, isWSL, MAX_LEN };
