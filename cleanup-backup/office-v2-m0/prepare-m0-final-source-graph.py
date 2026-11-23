from pathlib import Path
import os,json,subprocess,hashlib,datetime,sys
m=Path('/Users/user/barocss-editor/.omx/m0');target=Path(sys.argv[1]).resolve();name=target.parent.name
allowed={'531-portal-lifecycle-next','532-word-current-memory','526-m0-current-verification','522-m0-next-integration','522-m0-portal-joint','532-word-typed-read-repair','536-root-sid-ownership','m0-final-integration'}
if name not in allowed:raise SystemExit('Unexpected new root')
canonical=Path('/Users/user/.codex/worktrees/522-sheet-account-integration/barocss-editor');frozen=Path('/Users/user/.codex/worktrees/522-m0-integration/barocss-editor')
base={'m0-final-integration':'4dc191bc442c260ab320f3d8a229fe2c3db98d9f','532-word-typed-read-repair':'95d6815857883d332cad2d8179e23729c4668265','536-root-sid-ownership':'2c889f64dcd7173cd02c037cb3e12640315db829'}.get(name,'7eca44213c9b9609c88b635dcfc0ee8412a7e21d')
def git(*a):return subprocess.check_output(['git',*a],cwd=target,text=True).strip()
registered=subprocess.check_output(['git','worktree','list','--porcelain'],cwd=canonical,text=True)
assert 'worktree '+str(target)+'\n' in registered
assert git('rev-parse','HEAD')==base
branch=sys.argv[2] if len(sys.argv)>2 else 'codex/'+name
assert branch.startswith('codex/') and not any(c.isspace() for c in branch)
current=git('branch','--show-current')
if not current:
 assert not git('status','--porcelain');subprocess.check_call(['git','switch','-c',branch],cwd=target)
else:assert current==branch,(current,branch)
for p in ['.nvmrc','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','experiments/office-suite-v2/package.json','experiments/office-suite-v2/pnpm-lock.yaml','apps/office-service/package.json']:
 assert (target/p).read_bytes()==(canonical/p).read_bytes(),p
for group in ['apps','packages']:
 for folder in (frozen/group).iterdir():
  if (folder/'node_modules').is_dir():
   a=json.loads((folder/'package.json').read_text());b=json.loads((target/group/folder.name/'package.json').read_text())
   for key in ['dependencies','devDependencies','peerDependencies','optionalDependencies']:assert a.get(key)==b.get(key),(folder,key)
ref=json.loads((m/'522-sheet-account-integration-dependency-links.json').read_text());created=[]
for e in ref['created']:
 if 'directory' in e:
  dst=target/Path(e['directory']).relative_to(canonical);assert not dst.is_symlink();dst.mkdir(parents=True,exist_ok=True)
 else:
  dst=target/Path(e['link']).relative_to(canonical);dest=Path(e['target'])
  if e.get('workspace_candidate'):dest=target/dest.relative_to(canonical)
  assert dest.exists(),dest
  if dst.is_symlink():assert dst.resolve()==dest.resolve(),dst
  else:assert not dst.exists(),dst;dst.symlink_to(dest,target_is_directory=dest.is_dir())
  created.append({'link':str(dst),'target':str(dest),'workspaceSource':bool(e.get('workspace_candidate'))})
standalone=Path('/Users/user/.codex/worktrees/522-sheet-ws-integration/barocss-editor/experiments/office-suite-v2/node_modules');dst=target/'experiments/office-suite-v2/node_modules';assert standalone.is_dir()
if dst.is_symlink():assert dst.resolve()==standalone.resolve()
else:assert not dst.exists();dst.symlink_to(standalone,target_is_directory=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'owner':'Execute Integration #522 dependency preparation only','root':str(target),'head':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),'branch':git('branch','--show-current'),'graph':'46 original node_modules directories /799 original entries /654 source-aware links; workspace links target NEWroot','standalone':str(standalone),'node':'/Users/user/.nvm/versions/node/v22.22.0/bin/node','pnpm':'8.15.0','manifestsExactCurrentAcceptedBase':True,'allFrozenDependencyFieldsMatch':True,'exportRegistrationDifference':'Accepted OfficeService export-only registration retained; not an install/dependency change','hashes':{p:sha(target/p) for p in ['.nvmrc','package.json','pnpm-lock.yaml','experiments/office-suite-v2/package.json','experiments/office-suite-v2/pnpm-lock.yaml','apps/office-service/package.json']},'sourceStatusAtDelivery':git('status','--porcelain'),'installedOrBuilt':False,'oldUserResourcesTouched':False,'sourceLinks':created}
p=m/(name+'-frozen-receipt.json');assert not p.exists();p.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'root':str(target),'branch':branch,'head':base,'receipt':str(p),'sha256':sha(p),'links':len(created),'sourceStatus':receipt['sourceStatusAtDelivery']}))
