'use strict';
/** A hook runs unless its id is listed in HOOKS_DISABLED (comma-separated). */

function isHookEnabled(hookId) {
    const disabled = String(process.env.HOOKS_DISABLED || '')
        .split(',')
        .map(v => v.trim().toLowerCase());
    return !disabled.includes(String(hookId || '').trim().toLowerCase());
}

module.exports = { isHookEnabled };
