mkdir -p /tmp/mine && cat > /tmp/mine/extract.py <<'EOF'
import json, os, glob, time, re, sys, collections
HOME=os.path.expanduser('~')
now=time.time()
out=open('/tmp/mine_user.jsonl','w')
tools=open('/tmp/mine_tools.jsonl','w')
files=[f for f in glob.glob(HOME+'/.claude/projects/*/*.jsonl') if now-os.path.getmtime(f)<60*86400]
INJ=re.compile(r'^\s*<(command-|local-command|system-reminder|user-prompt-submit-hook|bash-|task-notification)|^Caveat:|^\[Request interrupted|This session is being continued|^Base directory for this skill', re.S)
n=0
for f in files:
    age=(now-os.path.getmtime(f))/86400
    proj=os.path.basename(os.path.dirname(f))
    sid=os.path.basename(f)[:-6]
    toolmap={}
    try:
        lines=open(f,errors='replace').read().splitlines()
    except Exception: continue
    for i,l in enumerate(lines):
        try: d=json.loads(l)
        except Exception: continue
        t=d.get('type')
        if t=='assistant':
            for c in (d.get('message') or {}).get('content') or []:
                if isinstance(c,dict) and c.get('type')=='tool_use':
                    inp=c.get('input') or {}
                    toolmap[c.get('id')]=(c.get('name'), (inp.get('command') or inp.get('file_path') or '')[:300])
        if t!='user' or d.get('isMeta') or d.get('isSidechain'): continue
        m=(d.get('message') or {}).get('content')
        texts=[]
        if isinstance(m,str): texts=[m]
        elif isinstance(m,list):
            for c in m:
                if not isinstance(c,dict): continue
                if c.get('type')=='text': texts.append(c.get('text',''))
                elif c.get('type')=='tool_result':
                    cc=c.get('content'); s=cc if isinstance(cc,str) else ' '.join(x.get('text','') for x in cc or [] if isinstance(x,dict))
                    tu=toolmap.get(c.get('tool_use_id'),('?',''))
                    tools.write(json.dumps({'f':sid,'p':proj,'age':age,'tool':tu[0],'cmd':tu[1],'err':bool(c.get('is_error')),'txt':s[:1500]})+'\n')
        for tx in texts:
            if not tx.strip() or INJ.search(tx): continue
            out.write(json.dumps({'f':sid,'p':proj,'age':age,'ts':d.get('timestamp'),'txt':tx[:3000]})+'\n'); n+=1
print(len(files), n)
EOF
scp -q /tmp/mine/extract.py devbox:/tmp/mine_extract.py && ssh devbox 'python3 -I /tmp/mine_extract.py; wc -l /tmp/mine_tools.jsonl'
