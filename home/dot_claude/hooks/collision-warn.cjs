#!/usr/bin/env node
/**
 * PreToolUse hook (Edit|Write|MultiEdit) — WARN-ONLY collision detector.
 *
 * If the file you're about to edit is also being changed on another worktree
 * branch (per the session-start collision map), inject a non-blocking warning
 * into the model's context. NEVER blocks the edit. Fails open on any error.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

function allow(context) {
    // Non-blocking: allow the tool, optionally attach context for the model.
    const out = {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    };
    if (context) out.hookSpecificOutput.additionalContext = context;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
}

function main() {
    let input = '';
    try {
        input = fs.readFileSync(0, 'utf8');
    } catch {
        return allow();
    }
    let filePath;
    try {
        filePath = JSON.parse(input).tool_input?.file_path;
    } catch {
        return allow();
    }
    if (!filePath) return allow();

    const dir = path.dirname(filePath);
    let toplevel, branch, commonDir;
    try {
        toplevel = git(['rev-parse', '--show-toplevel'], dir);
        branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
        commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir);
    } catch {
        return allow();
    }

    const rel = path.relative(toplevel, filePath);
    let mapText;
    try {
        mapText = fs.readFileSync(path.join(commonDir, 'collision-map.tsv'), 'utf8');
    } catch {
        return allow();
    }

    const relDir = path.dirname(rel);
    // The area check would be noise at the repo root or a top-level dir, so only
    // treat a directory of 2+ segments as a specific-enough "area" (e.g.
    // apps/disclosures/tests/2026-enhancements, not apps/ or .).
    const areaOk = relDir !== '.' && relDir.split('/').length >= 2;

    const exact = new Set(); // other branches touching the EXACT file
    const nearby = new Map(); // "branch (worktree)" -> Set(basename) for same-dir files
    for (const line of mapText.split('\n')) {
        const [file, b, wt] = line.split('\t');
        if (!file || !b || b === branch) continue;
        const label = `${b} (worktree ${wt})`;
        if (file === rel) exact.add(label);
        else if (areaOk && path.dirname(file) === relDir) {
            if (!nearby.has(label)) nearby.set(label, new Set());
            nearby.get(label).add(path.basename(file));
        }
    }

    // Exact-file collision is the strong signal — report it and stop.
    if (exact.size) {
        const warn =
            `⚠️ COLLISION: ${rel} is also modified on:\n` +
            [...exact].map(o => `   • ${o}`).join('\n') +
            `\nAnother session/PR is already changing this exact file. Before editing, check for an ` +
            `open PR or active branch on it and build on THAT branch — or confirm you mean to diverge. ` +
            `(Warning only; the edit is allowed.)`;
        return allow(warn);
    }

    // Otherwise, area overlap: another branch is working in the same directory —
    // likely similar work, even though not the same file.
    if (nearby.size) {
        const warn =
            `⚠️ NEARBY WORK: ${relDir}/ is also being changed on:\n` +
            [...nearby.entries()]
                .map(([label, files]) => `   • ${label} — e.g. ${[...files].slice(0, 3).join(', ')}`)
                .join('\n') +
            `\nAnother session is working in the same area — you may be doing similar work. ` +
            `Check that branch before diverging. (Warning only; the edit is allowed.)`;
        return allow(warn);
    }

    return allow();
}

try {
    main();
} catch {
    allow();
}
