'use strict';
// gap: permissions.deny Bash rules match the command only; they cannot read the session's prompts or a local port list.
// Blocks a command that runs against UAT (`mise -E uat`) or kills what holds the
// live dev ports, since Drew is often using both, unless one of his prompts in this
// session names UAT or the port. The ports and any start commands that free them
// are work-specific, so they live in an untracked local file (LOCAL_CONFIG), never
// in this public repo; with no file only the UAT rule applies.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCommand } = require('../lib/hook-io');
const { rewriteHeredocs } = require('../lib/shell');

const LOCAL_CONFIG = path.join(
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
    'work-safety.local.json',
);

// `-E uat`, `-Euat`, `--env="uat"`, `-E dev,uat`, `MISE_ENV=dev,uat`.
const UAT_VALUE = String.raw`['"]?(?:[\w-]+,)*uat(?![\w-])`;
const UAT = new RegExp(String.raw`\bmise\b[^;&|\n]*?\s(?:-E|--env)(?:\s*|=)${UAT_VALUE}|\bMISE_ENV=${UAT_VALUE}`);
const KILL = /\b(?:kill|pkill|killall|kill-port|Stop-Process)\b|\bfuser\b[^;&|\n]*\s-k\b/;
// A sentence that forbids the target ("Do NOT run -E uat") is not a request for it.
const NEGATION = /\b(?:not|never|no|avoid|without)\b|n't\b/i;

const portToken = port => new RegExp(`(?<![\\d.])${port}(?!\\d)`);

function loadConfig(file = LOCAL_CONFIG) {
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ports: raw.ports || [], commands: raw.commands || [] };
    } catch {
        return { ports: [], commands: [] };
    }
}

// Drew's typed prompts in the session transcript. Tool results, injected context
// and an Agent call's brief are not his prompts; hooks inside a subagent get the
// main session's transcript, so a subagent is held to what Drew asked for.
function promptsFrom(transcriptPath) {
    let lines;
    try {
        lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
    } catch {
        return [];
    }
    const prompts = [];
    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary) continue;
        const content = entry.message?.content;
        const texts =
            typeof content === 'string'
                ? [content]
                : Array.isArray(content)
                  ? content.filter(c => c?.type === 'text').map(c => c.text)
                  : [];
        for (const t of texts) prompts.push(t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ''));
    }
    return prompts;
}

// A heredoc written to a file (a note, a doc) runs nothing, unless the same command
// then names that file again, to run it.
function checkedText(command) {
    const stripped = rewriteHeredocs(command, (body, kind) => (kind === 'data' ? '' : body));
    const written = stripped
        .split('\n')
        .filter(line => line.includes('<<'))
        .flatMap(line => [...line.matchAll(/(?:>|\btee\s+(?:-a\s+)?)\s*([^\s;&|<>'"]+)/g)].map(m => path.basename(m[1])));
    const runs = written.some(f => stripped.split(f).length > 2);
    return runs ? command : stripped;
}

const asksFor =(prompts, re) =>
    prompts.some(p => p.split(/[.!?\n]+/).some(s => re.test(s) && !NEGATION.test(s)));

function run(input, deps = {}) {
    const config = deps.config || loadConfig();
    const prompts = deps.prompts || (() => promptsFrom(input?.transcript_path));
    const cmd = checkedText(getCommand(input));
    if (!cmd) return { exitCode: 0 };

    if (UAT.test(cmd) && !asksFor(prompts(), /\buat\b/i))
        return {
            exitCode: 2,
            stderr: [
                'Blocked: this runs against UAT, and Drew is using it. None of his prompts in this session asks for UAT.',
                'Instead: run against SIT (`-E sit`) or the default environment. If UAT is really needed, ask Drew,',
                'and once he names UAT in a prompt this check lets it through.',
            ].join('\n'),
        };

    const killed = KILL.test(cmd) ? config.ports.filter(p => portToken(p).test(cmd)) : [];
    const starter = config.commands.find(c => new RegExp(c).test(cmd));
    if (!killed.length && !starter) return { exitCode: 0 };
    const ports = config.ports.map(String);
    if (ports.length && asksFor(prompts(), new RegExp(`\\b(?:${ports.join('|')})\\b`))) return { exitCode: 0 };
    return {
        exitCode: 2,
        stderr: [
            `Blocked: this stops what holds the live dev ports (${ports.join(', ')}), which Drew is using.`,
            'Instead: start your copy on another port, or test against the server already running there without',
            'restarting it. If it must be stopped, ask Drew; once he names the port in a prompt this check lets it through.',
        ].join('\n'),
    };
}

module.exports = { run, promptsFrom, LOCAL_CONFIG };
