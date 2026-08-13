#!/usr/bin/env python3
"""Search past Claude sessions by content.
Ranks by how many DISTINCT query terms a transcript matches (a session hitting all your
terms beats one that just repeats a common word), then by total hits, then recency."""
import sys, subprocess, glob, os, re, datetime, json
from pathlib import Path

def current_project_token():
    """The project name embedded in this project's session slug — derived from cwd, so the default
    scope follows whatever repo you run in. From inside a worktree (`.../.claude/worktrees/<name>`)
    it resolves to the PARENT project, so worktree sessions stay in scope."""
    cwd = os.getcwd()
    return cwd.split('/.claude/worktrees/')[0].rstrip('/').split('/')[-1]

def slug_dirs(all_projects):
    base = os.path.expanduser('~/.claude/projects')
    scope = '*/' if all_projects else f'*{current_project_token()}*/'
    return glob.glob(f'{base}/{scope}')

def rg(*a):
    try:
        return subprocess.run(['rg', *a], capture_output=True, text=True).stdout
    except FileNotFoundError:
        sys.exit("ripgrep (rg) not found")

def field(fp, key, last=False):
    out = rg('-o', f'"{key}":"[^"]*"', fp).splitlines()
    if not out: return ''
    return (out[-1] if last else out[0]).split(f'"{key}":"', 1)[1].rstrip('"')

def transcript_for(sid):
    hits = glob.glob(os.path.expanduser(f'~/.claude/projects/**/{sid}*.jsonl'), recursive=True)
    return hits[0] if hits else None

def show_removed():
    """List Agent View cards that housekeeping removed (from the removal log). The card is gone but
    the transcript is kept by `claude rm`, so each is still resumable."""
    log = os.path.expanduser('~/.claude/housekeeping/removed-log.jsonl')
    if not os.path.exists(log):
        print("no removal log yet — nothing recorded as removed"); return
    rows = [json.loads(l) for l in open(log) if l.strip()]
    rows.sort(key=lambda r: r.get('removedAt', ''), reverse=True)
    print(f"{len(rows)} removed Agent View cards (newest first) — transcripts kept, resumable:\n")
    for r in rows:
        sid = r['id']
        alive = transcript_for(sid.split('-')[0]) is not None
        mark = '' if alive else '  ⚠ transcript gone (past cleanupPeriodDays)'
        print(f"{r.get('removedAt','?')}  {r.get('title','(untitled)')[:44]:44} {r.get('branch','')[:22]:22}{mark}")
        if alive: print(f"            resume: claude --resume {sid}\n")

def main():
    args = sys.argv[1:]
    if '--removed' in args:
        show_removed(); return
    all_projects = '--all' in args
    terms = [a for a in args if a != '--all']
    if not terms:
        sys.exit("usage: find-session.py [--all] <terms...>   |   find-session.py --removed")
    # per-file: {term: count}
    hits = {}
    for d in slug_dirs(all_projects):
        for term in terms:
            for line in rg('-c', '-i', '-e', re.escape(term), '--glob', '*.jsonl', d).splitlines():
                fp, _, c = line.rpartition(':')
                if fp.endswith('.jsonl') and c.isdigit():
                    hits.setdefault(fp, {})[term] = int(c)
    if not hits:
        print("no matching sessions — try broader terms"); return
    def score(fp):
        d = hits[fp]
        return (len(d), sum(d.values()), os.path.getmtime(fp))  # distinct terms, total, recency
    ranked = sorted(hits, key=score, reverse=True)[:15]
    n_all = sum(1 for fp in hits if len(hits[fp]) == len(terms))
    print(f"{len(hits)} sessions match ≥1 term; {n_all} match all {len(terms)}. Top {len(ranked)}:\n")
    combined = '|'.join(re.escape(t) for t in terms)
    for fp in ranked:
        sid = Path(fp).stem
        d = hits[fp]
        title = field(fp, 'aiTitle') or '(untitled)'
        branch = field(fp, 'gitBranch', last=True)
        date = datetime.date.fromtimestamp(os.path.getmtime(fp)).isoformat()
        wt = ' [worktree]' if 'worktrees' in os.path.basename(os.path.dirname(fp)) else ''
        matched = ','.join(t for t in terms if t in d)
        print(f"{date}  {len(d)}/{len(terms)} terms ({matched})  {title[:40]:40} {branch[:24]:24}{wt}")
        print(f"            resume: claude --resume {sid}\n")
    print("(--all searches every project; add rarer/more-specific terms to sharpen ranking)")

if __name__ == '__main__':
    main()
