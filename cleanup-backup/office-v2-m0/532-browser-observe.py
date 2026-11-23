from pathlib import Path
import json,subprocess,time,datetime,sys
p=Path('/Users/user/barocss-editor/.omx/m0');meta=p/'integration-logs/48-532-Word-print-browser14.json';seen={};polls=0
while not meta.exists():time.sleep(.1)
r=json.loads(meta.read_text());root=r['pid']
while True:
 rows={}
 for line in subprocess.check_output(['ps','-axo','pid=,ppid=,comm='],text=True).splitlines():
  parts=line.strip().split(None,2)
  if len(parts)==3: rows[int(parts[0])]=(int(parts[1]),parts[2])
 owned={root};changed=True
 while changed:
  old=len(owned);owned.update(pid for pid,(ppid,_) in rows.items() if ppid in owned);changed=old!=len(owned)
 for pid in owned:
  if pid in rows and pid not in seen:seen[pid]=dict(pid=pid,parentPid=rows[pid][0],command=rows[pid][1],firstObservedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
 polls+=1;r=json.loads(meta.read_text())
 if r['status']=='completed':break
 time.sleep(.4)
time.sleep(.5)
alive=[]
for pid in seen:
 check=subprocess.run(['ps','-p',str(pid),'-o','comm='],text=True,capture_output=True)
 if check.returncode==0:alive.append(dict(pid=pid,command=check.stdout.strip()))
port=subprocess.run(['lsof','-nP','-iTCP:55261','-sTCP:LISTEN'],text=True,capture_output=True)
out=dict(source='45a82a7c6f77268a7f63c685610338d48ced777f',rootCommandPid=root,observationStartedAfterLaunch=True,polls=polls,observed=list(seen.values()),remainingObserved=alive,port55261Absent=port.returncode==1,preview55262IntentionallyPreserved=True)
(p/'532-browser-owned-cleanup.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(dict(observed=len(seen),remaining=alive,portAbsent=out['port55261Absent'])))
assert not alive and out['port55261Absent']
