#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# ///
"""Rename never-named, dead Claude sessions to their branch, so the resume picker is scannable.
Custom name lives in ~/.claude/sessions/<pid>.json as `name` with NO `nameSource` key (derived
sessions keep `"nameSource":"derived"`). Only touches DEAD pids on a real feature branch.
Field mechanics are undocumented (reverse-engineered) — re-verify against a hand-rename if a CC
upgrade changes them. See memory: claude_session_rename_and_find."""
import argparse, json, glob, os, re, subprocess, sys, shutil, time
SESS = os.path.expanduser('~/.claude/sessions')
PROJ = os.path.expanduser('~/.claude/projects')
SKIP = {'', 'HEAD', 'develop', 'main', 'master'}

def alive(pid):
    try: os.kill(int(pid), 0); return True
    except (OSError, ValueError): return False

def branch_of(sid):
    """(branch, has_transcript) — last gitBranch in the session's transcript."""
    for d in glob.glob(f'{PROJ}/*/'):
        fp = f'{d}{sid}.jsonl'
        if os.path.exists(fp):
            out = subprocess.run(['rg', '-o', '"gitBranch":"[^"]*"', fp],
                                 capture_output=True, text=True).stdout.splitlines()
            return (out[-1].split('"gitBranch":"', 1)[1].rstrip('"') if out else ''), True
    return None, False

def candidates():
    for f in sorted(glob.glob(f'{SESS}/*.json')):
        pid = os.path.basename(f)[:-5]
        try: d = json.load(open(f))
        except (json.JSONDecodeError, OSError): continue
        if alive(pid) or 'nameSource' not in d: continue   # skip live + already-custom-named
        sid = d.get('sessionId', '')
        br, has_tx = branch_of(sid)
        if not has_tx or br in SKIP: continue               # unresumable or no real branch
        slug = re.sub(r'[^a-z0-9]+', '-', br.lower()).strip('-')[:32]
        yield f, d, d.get('name', '?'), f'{slug}-{sid[:4]}'

def main():
    ap = argparse.ArgumentParser(
        description="Rename never-named, DEAD Claude sessions to <branch-slug>-<sid4> so the "
                    "resume picker is scannable. Dry-run by default.",
        epilog="examples:\n"
               "  rename-sessions.py           # dry-run, prints proposed renames\n"
               "  rename-sessions.py --apply   # backs up ~/.claude/sessions, then writes",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true',
                    help='write the renames (a timestamped backup of the dir is taken first)')
    apply = ap.parse_args().apply
    cands = list(candidates())
    if not cands:
        print('nothing to rename (no dead, unnamed, real-branch sessions)'); return
    if apply:
        bak = f'{SESS}-backup-{int(time.time())}'
        shutil.copytree(SESS, bak); print(f'backup: {bak}\n')
    for f, d, old, new in cands:
        print(f'  {os.path.basename(f):16} {old:24} ->  {new}')
        if apply:
            d['name'] = new; d.pop('nameSource', None)
            json.dump(d, open(f, 'w'))
    print(f'\n{"renamed" if apply else "would rename"} {len(cands)} sessions'
          + ('' if apply else '  —  re-run with --apply'))

if __name__ == '__main__':
    main()
