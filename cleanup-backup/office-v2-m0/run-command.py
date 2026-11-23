import datetime,json,os,pathlib,subprocess,sys,time
label,cwd,*argv=sys.argv[1:]
logs=pathlib.Path(__file__).parent/'integration-logs'
log=logs/(label+'.txt')
meta=logs/(label+'.json')
if log.exists() or meta.exists():
    raise SystemExit('Refusing to overwrite existing evidence: '+label)
env=os.environ.copy()
env['PATH']='/Users/user/.nvm/versions/node/v22.22.0/bin:'+env.get('PATH','')
start=time.monotonic()
record={'label':label,'cwd':cwd,'argv':argv,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':'22.22.0','pnpm':'8.15.0','status':'running'}
with log.open('w') as output:
    child=subprocess.Popen(argv,cwd=cwd,env=env,stdout=output,stderr=subprocess.STDOUT)
    record['pid']=child.pid
    meta.write_text(json.dumps(record,indent=2)+'\n')
    result=child.wait()
record.update(status='completed',exit_code=result,elapsed_seconds=round(time.monotonic()-start,3),finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),log=str(log))
meta.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
print('\n'.join(log.read_text(errors='replace').splitlines()[-45:]))
raise SystemExit(result)
