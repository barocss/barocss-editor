from pathlib import Path
import datetime,json,os,subprocess,sys
frozen=Path('/Users/user/.codex/worktrees/522-m0-integration/barocss-editor').resolve()
target=Path(sys.argv[1]).resolve()
if target==frozen:raise SystemExit('Target must be a separate managed author worktree')
registered=subprocess.check_output(['git','worktree','list','--porcelain'],cwd=frozen,text=True)
if 'worktree '+str(target)+'\n' not in registered:raise SystemExit('Target is not a registered worktree')
for name in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml']:
 if (frozen/name).read_bytes()!=(target/name).read_bytes():raise SystemExit('Frozen graph mismatch: '+name)
created=[]
def directory(path):
 if path.is_symlink():raise SystemExit('Refusing to write through an existing directory symlink: '+str(path))
 if path.exists():
  if not path.is_dir():raise SystemExit('Expected directory: '+str(path))
 else:path.mkdir(parents=True);created.append({'directory':str(path)})
def destination(source):
 resolved=source.resolve()
 try:rel=resolved.relative_to(frozen)
 except ValueError:return resolved
 if len(rel.parts)==2 and rel.parts[0] in ['packages','apps'] and (resolved/'package.json').is_file():return target/rel
 return resolved
def link(source,path):
 expected=destination(source)
 if path.is_symlink():
  if path.resolve()!=expected.resolve():raise SystemExit('Existing link mismatch: '+str(path))
  return
 if path.exists():raise SystemExit('Preserve existing entry; not overwritten: '+str(path))
 path.symlink_to(expected,target_is_directory=source.is_dir());created.append({'link':str(path),'target':str(expected),'workspace_candidate':str(expected).startswith(str(target))})
folders=[frozen/'node_modules']
for group in ['packages','apps']:
 for parent in sorted((frozen/group).iterdir()):
  if (parent/'node_modules').is_dir():
   if (parent/'package.json').read_bytes()!=(target/parent.relative_to(frozen)/'package.json').read_bytes():raise SystemExit('Package manifest mismatch: '+str(parent))
   folders.append(parent/'node_modules')
for folder in folders:
 output=target/folder.relative_to(frozen);directory(output)
 for entry in folder.iterdir():
  if entry.name.startswith('@') and entry.is_dir() and not entry.is_symlink():
   scoped=output/entry.name;directory(scoped)
   for child in entry.iterdir():link(child,scoped/child.name)
  else:link(entry,output/entry.name)
report={'captured_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'frozen_root':str(frozen),'author_root':str(target),'source_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=target,text=True).strip(),'directories':len(folders),'created_entries':len(created),'created':created,'boundary':'No install/config/lock/source change. Workspace package links target author sources; external packages target the one frozen graph. Actual node_modules directories stay ignored.'}
log=Path('/Users/user/barocss-editor/.omx/m0')/(target.parent.name+'-dependency-links.json');log.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'author_root':str(target),'source_head':report['source_head'],'directories':len(folders),'created_entries':len(created),'log':str(log)},indent=2))
