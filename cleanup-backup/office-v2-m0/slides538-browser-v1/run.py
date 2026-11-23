from pathlib import Path
import datetime,hashlib,json,os,signal,subprocess,time
out=Path(__file__).parent
lease=json.loads((out/'lease.json').read_text())
root=Path(lease['sourceRoot'])
node='/Users/user/.nvm/versions/node/v22.22.0/bin/node'
source=root/'apps/slide/tests/connector.spec.ts'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*a):return subprocess.check_output(['git','-C',str(root),*a],text=True).strip()
def processes():
 result={}
 for line in subprocess.check_output(['ps','-axo','pid=,ppid=,lstart=,comm='],text=True).splitlines():
  fields=line.split(None,7)
  if len(fields)>=7:result[int(fields[0])]={'parent':int(fields[1]),'identity':' '.join(fields[2:7]),'command':fields[7] if len(fields)>7 else ''}
 return result
def listener(port):
 p=subprocess.run(['lsof','-nP',f'-iTCP:{port}','-sTCP:LISTEN','-t'],capture_output=True,text=True)
 return sorted(set(p.stdout.split()))
assert lease['status']=='granted'
assert git('rev-parse','HEAD')==lease['sourceHead']
assert sha(source)==lease['WIPSHA256']
assert not listener(55261)
assert (out/'vite.config.mjs').exists()
assert not (out/'execution.json').exists()
protected={str(p):listener(p) for p in range(55262,55267)}
start=datetime.datetime.now(datetime.timezone.utc)
argv=[node,str(root/'node_modules/@playwright/test/cli.js'),'test','--config',str(out/'playwright.config.mjs')]
record={'startedUTC':start.isoformat(),'argv':argv,'cwd':str(root),'sourceHead':git('rev-parse','HEAD'),'sourceSHA256':sha(source),'selectedCases':22,'protectedListenersBefore':protected,'configSHA256':sha(out/'playwright.config.mjs'),'viteConfigSHA256':sha(out/'vite.config.mjs')}
owned={}
with (out/'stdout.txt').open('w') as log:
 p=subprocess.Popen(argv,cwd=root,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH']},start_new_session=True)
 record['pid']=p.pid
 try:
  while p.poll() is None:
   ps=processes();ids={p.pid}
   while True:
    more={pid for pid,v in ps.items() if v['parent'] in ids}
    if more<=ids:break
    ids|=more
   for pid in ids:
    if pid in ps:owned[pid]=ps[pid]
   if (datetime.datetime.now(datetime.timezone.utc)-start).total_seconds()>190:
    record['runnerTimeout']=True;p.terminate();break
   time.sleep(.25)
  p.wait(timeout=5)
  record['exitCode']=p.returncode
 finally:
  ps=processes()
  for pid,identity in owned.items():
   if pid in ps and ps[pid]['identity']==identity['identity']:
    try:os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:pass
  time.sleep(1)
  ps=processes()
  for pid,identity in owned.items():
   if pid in ps and ps[pid]['identity']==identity['identity']:
    try:os.kill(pid,signal.SIGKILL)
    except ProcessLookupError:pass
  time.sleep(.3)
  ps=processes()
  record.update({'finishedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':(datetime.datetime.now(datetime.timezone.utc)-start).total_seconds(),'sourceHeadAfter':git('rev-parse','HEAD'),'sourceSHA256After':sha(source),'ownedProcesses':owned,'ownedStillPresent':[pid for pid,v in owned.items() if pid in ps and ps[pid]['identity']==v['identity']],'privateListenerAfter':listener(55261),'protectedListenersAfter':{str(p):listener(p) for p in range(55262,55267)}})
  (out/'execution.json').write_text(json.dumps(record,indent=2))
print(json.dumps({k:v for k,v in record.items() if k!='ownedProcesses'},indent=2))
