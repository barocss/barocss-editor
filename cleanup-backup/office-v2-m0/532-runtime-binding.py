from pathlib import Path
import subprocess,hashlib,json,sys,datetime
root=Path('/Users/user/.codex/worktrees/522-m0-integration/barocss-editor');p=Path('/Users/user/barocss-editor/.omx/m0')
label=sys.argv[1];target=p/('532-binding-'+label+'.json')
assert not target.exists(), target
source='packages/office-word/src/line-offsets.ts'
def git(*a):return subprocess.check_output(['git',*a],cwd=root).decode().strip()
assert git('rev-parse','HEAD')=='45a82a7c6f77268a7f63c685610338d48ced777f'
assert not git('status','--porcelain')
b=root.joinpath(source).read_bytes();sha=hashlib.sha256(b).hexdigest();blob=git('rev-parse','HEAD:'+source)
assert sha=='21be21264601f75a4465d3dec0475b4289647c6552e27dc6e240d887fd11d755'
assert blob=='5dd28b9b44cdd79054413a6d62f2c29198e6fd87'
record=dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),path=source,blob=blob,sha256=sha,bytes=len(b),clean=True,outsideCurated17=True,normalH7='unchanged')
target.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
