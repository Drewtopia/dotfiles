'use strict';
/**
 * Shared hook enable/disable controls (ECC-style, own namespace).
 *
 * Env controls:
 *   HOOKS_PROFILE=minimal|standard|strict   (default: standard)
 *   HOOKS_DISABLED=comma,separated,hook,ids
 *
 * A hook is enabled when:
 *   - its id is NOT in HOOKS_DISABLED, AND
 *   - the active HOOKS_PROFILE is in the hook's allowed profiles.
 */

const VALID_PROFILES = new Set(['minimal', 'standard', 'strict']);

const normalizeId = value =>
    String(value || '')
        .trim()
        .toLowerCase();

function getHookProfile() {
    const raw = String(process.env.HOOKS_PROFILE || 'standard')
        .trim()
        .toLowerCase();
    return VALID_PROFILES.has(raw) ? raw : 'standard';
}

function getDisabledHookIds() {
    const raw = String(process.env.HOOKS_DISABLED || '');
    if (!raw.trim()) return new Set();
    return new Set(raw.split(',').map(normalizeId).filter(Boolean));
}

function parseProfiles(rawProfiles, fallback = ['standard', 'strict']) {
    if (!rawProfiles) return [...fallback];
    const list = Array.isArray(rawProfiles)
        ? rawProfiles
        : String(rawProfiles).split(',');
    const parsed = list
        .map(v =>
            String(v || '')
                .trim()
                .toLowerCase(),
        )
        .filter(v => VALID_PROFILES.has(v));
    return parsed.length > 0 ? parsed : [...fallback];
}

function isHookEnabled(hookId, options = {}) {
    const id = normalizeId(hookId);
    if (!id) return true;
    if (getDisabledHookIds().has(id)) return false;
    return parseProfiles(options.profiles).includes(getHookProfile());
}

module.exports = {
    VALID_PROFILES,
    normalizeId,
    getHookProfile,
    getDisabledHookIds,
    parseProfiles,
    isHookEnabled,
};
