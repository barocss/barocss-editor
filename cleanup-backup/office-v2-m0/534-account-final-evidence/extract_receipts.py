"""Extract existing owned check records. Never runs a check or reads runtime secrets."""
import hashlib,json,re,subprocess
from pathlib import Path
BASE=Path(__file__).resolve().parent
REPO=Path('/Users/user/.codex/worktrees/534-sheet-account-execute/barocss-editor')
S='2ebf8113a7a0ad8da526eea48077278a22eae5fe'
T='6e74ff05adf67dcd9e7ea39169347bbe09d4691f'
G='4c776e149825d6362657facc25a994ecbe75c65d'
SOURCES={
 'parent':Path('/Users/user/.codex/sessions/2026/10/21/rollout-2026-10-21T23-07-58-01a15eca-4aec-7d32-a2c4-37e6824c0b8e.jsonl'),
 'authority':Path('/Users/user/.codex/sessions/2026/10/22/rollout-2026-10-22T14-58-37-01a16230-a403-7942-b4f1-e3fc93df9332.jsonl'),
 'transport':Path('/Users/user/.codex/sessions/2026/10/22/rollout-2026-10-22T14-58-45-01a16230-c3ce-7193-9bd7-bf076b599310.jsonl'),
}
INDEX={}
for who,p in SOURCES.items():
 for n,line in enumerate(p.read_bytes().splitlines(keepends=True),1):
  x=json.loads(line);v=x.get('payload',{})
  if x.get('type')=='response_item' and v.get('call_id'):
   INDEX.setdefault((who,v['call_id']),[]).append((n,line,x))
def sha(b):return hashlib.sha256(b).hexdigest()
def write_json(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def results(value):
 if isinstance(value,dict):
  if 'output' in value and ('wall_time_seconds' in value or 'chunk_id' in value):yield value;return
  for v in value.values():yield from results(v)
 elif isinstance(value,list):
  for v in value:yield from results(v)
def calls(who,ids):return [(who,k) for k in ids.split()]
GROUPS=[
 ('postcommit-red',calls('parent','call_c3df19d59afb4d0797679177ddc5cc5e call_9c6752cfe90343949fd2d93c1204cf44'),'Before WS commit/unknown guard; two copied optional-property diagnostics and two false-rejection failures.',False),
 ('postcommit-green',calls('parent','call_4d9fb7e8814049259cdf5f55892f0923 call_2ba9cdd343344ac5a4dc4d0398673ad7'),'After WS-only guard/optional-property fix, before authority/native fences.',False),
 ('precommit-oracle-failure',calls('authority','call_601f1dfaf34b416c9b38e539350e7e64 call_706b163f998d40b1ac41ea80910e4c6e'),'Twelve existing PASS, three SQLite read-only oracle lock failures. Not valid production RED.',False),
 ('precommit-red',calls('authority','call_52747eb4df6742a69c675d484dd3583f'),'Corrected exclusive-lock oracle. Three native SQLite packet counts1 versus required0.',False),
 ('authority-red',calls('parent','call_3ceb2bb6f7e648d08b85d7ba3229f7b9'),'Original authority, three new waiting-login/absolute-clock failures.',False),
 ('precommit-authority-green',calls('parent','call_33c89fe6a75242e2a183f348eaf737ed call_42ab0bad981048ceace755cd14dac640'),'After absolute deadline/local epoch/post-native-validation fence; two selected three-case suites PASS.',False),
 ('strict-eight',calls('parent','call_00b50c527ee64bda9ac3b9f6a4da77b7 call_495fd38a62a14dcda60cabe73bbf636a'),'Eight owned/directly affected roots, imports included,0 diagnostics before expiry-code priority repair.',False),
 ('combined49-and-http3',calls('parent','call_ddef035a3d784b5998a94d6c0fb05271 call_4cc1573307f54946bab77abfc406f063 call_d2fef28e55f54f129675c405e4b4eb19 call_bb28ca01410c4b40a77e307a0a5a1812'),'First suite49:47PASS/2FAIL, then HTTP/controlled selected3PASS. The single shell exit0 belongs to BOTH commands; first Node process exit was not captured separately.',False),
 ('priority-repair-green',calls('parent','call_16d7b12d9cda4c4489bbfc2480cce035 call_a00972699c604be7b34133bbb880f829'),'Expiry priority repair: identical two original failures plus three new authority cases5PASS; strict1root0.',False),
 ('publication-red',calls('transport','call_c597e74fa3f74bb78f3c60ed1493292c'),'Before callback-check propagation/encode-to-enqueue fence; one correlated state frame leaked past absolute deadline.',False),
 ('transport-final-green',calls('parent','call_ffe45f4e933e4a02abdbb50f52c64010 call_e404a2a5cb1c4dbcb7cf9c6c00c83144'),'Final S production blobs, five actual native/port0 transport checks PASS and strict2roots0.',False),
 ('bootstrap-green',calls('authority','call_15cc17509c3c46729eb08f19abb2ee1b call_60f0d94e337a4f12b5a0c6275e182a63'),'Unchanged bootstrap files retained in final S; strict2roots0 and5native PASS.',False),
 ('style-lint-green',calls('parent','call_57cadbc53d1e487faa425c52c79bb9e3 call_5e87b56afa144761830f0c448188ec72'),'T one-file stylistic followup; narrow ESLint exit0 with empty stdout. No S lint PASS claim.',True),
 ('style-types-green',calls('parent','call_5e87b56afa144761830f0c448188ec72 call_427369abf5c34d8795d95a51897286ac'),'T narrow source strict1root0. No tests rerun for stylistic object-spread change.',False),
]
receipts=[]
for name,keys,stage,allow_empty in GROUPS:
 folder=BASE/name;folder.mkdir(exist_ok=True)
 provenance=[];commands=[];chunks=[];tool_records=[]
 for key in keys:
  if key not in INDEX:raise RuntimeError('missing original call '+str(key))
  for line_no,raw,x in INDEX[key]:
   p=x['payload'];typ=p['type']
   provenance.append({'transcript':str(SOURCES[key[0]]),'line':line_no,'originalRecordBytes':len(raw),'originalRecordSha256':sha(raw),'callId':key[1],'type':typ,'timestamp':x.get('timestamp')})
   if typ=='custom_tool_call':
    code=p.get('input','')
    wd=re.findall(r'"?workdir"?:\s*("(?:[^"\\]|\\.)*")',code)
    for match in re.findall(r'cmd:\s*("(?:[^"\\]|\\.)*")',code):
     cmd=json.loads(match)
     if (name!='style-lint-green' or 'pnpm exec eslint' in cmd) and any(t in cmd for t in ['--test','type-check','pnpm exec eslint']):commands.append({'command':cmd,'declaredWorkdirs':[json.loads(t) for t in wd],'callId':key[1]})
    # Exact call input is source-patch/command provenance; no tool message bodies or private runtime config.
    tool_records.append({'timestamp':x.get('timestamp'),'payload':p})
   elif typ=='custom_tool_call_output':
    for content in p.get('output',[]):
     text=content.get('text','')
     try:parsed=json.loads(text)
     except (ValueError,TypeError):continue
     for result in results(parsed):
      output=result.get('output','')
      if name=='style-lint-green' and output:continue
      relevant=bool(re.search(r'(?m)^(?:TAP version|# (?:Subtest:|tests |pass |fail )|Strict TypeScript|> @office-suite-v2|zsh:)',output))
      if not relevant and not (allow_empty and not output):continue
      if name=='style-types-green' and not output:continue
      chunks.append(output)
      tool_records.append({'timestamp':x.get('timestamp'),'callId':key[1],'originalResultText':text,'selectedExecResult':result})
 out=''.join(chunks)
 if not chunks:raise RuntimeError('no check output '+name)
 (folder/'combined-output.txt').write_text(out)
 write_json(folder/'commands.json',commands)
 (folder/'original-tool-records.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in tool_records))
 write_json(folder/'provenance.json',provenance)
 exits=[r['selectedExecResult'].get('exit_code') for r in tool_records if 'selectedExecResult' in r and r['selectedExecResult'].get('exit_code') is not None]
 summaries=[{'tests':int(a),'pass':int(b),'fail':int(c)} for a,b,c in re.findall(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',out,re.S)]
 receipt={'group':name,'baseCommit':G,'finalSourceAnchorS':S,'styleSuccessorT':T,'sourceState':stage,'exitCodesAsActuallyCaptured':exits,'tapSummaries':summaries,'originalCommandCount':len(commands),'reexecuted':False,'secretBoundary':'Only selected owned source/check tool records; no runtime credentials/config/database/provider logs read or copied.','perProcessExitCaveat':'Combined shell sessions expose only shell exit; do not fabricate individual command exits.'}
 write_json(folder/'receipt.json',receipt);receipts.append(receipt)
# Final immutable source objects are referenced by exact Git object and byte hash, not copied.
paths=subprocess.check_output(['git','-C',str(REPO),'diff','--name-only',G,S],text=True).splitlines()
source_objects=[]
for commit in [S,T]:
 for path in paths:
  data=subprocess.check_output(['git','-C',str(REPO),'show',commit+':'+path])
  blob=subprocess.check_output(['git','-C',str(REPO),'rev-parse',commit+':'+path],text=True).strip()
  source_objects.append({'commit':commit,'path':path,'gitBlob':blob,'bytes':len(data),'sha256':sha(data)})
write_json(BASE/'source-objects.json',source_objects)
# Original production edits anchor the WIP failure/success chronology; do not mislabel RED as final S.
patches=[]
for cid in ['call_4d9fb7e8814049259cdf5f55892f0923','call_33c89fe6a75242e2a183f348eaf737ed','call_16d7b12d9cda4c4489bbfc2480cce035','call_ffe45f4e933e4a02abdbb50f52c64010','call_57cadbc53d1e487faa425c52c79bb9e3']:
 for n,raw,x in INDEX[('parent',cid)]:
  p=x['payload']
  if p['type']=='custom_tool_call':
   for item in re.findall(r'tools\.apply_patch\(("(?:[^"\\]|\\.)*")\)',p.get('input','')):
    patches.append({'callId':cid,'transcriptLine':n,'timestamp':x.get('timestamp'),'patch':json.loads(item)})
write_json(BASE/'source-delta-timeline.json',patches)
# Link already stable Integration-owned lint failure. Never rewrite or duplicate it.
links=[]
for path in ['/Users/user/barocss-editor/.omx/m0/account-joined-lint.log','/Users/user/barocss-editor/.omx/m0/534-sheet-account-execute-frozen-copy-receipt.json','/Users/user/barocss-editor/.omx/m0/534-sheet-account-execute-config-bindings.json']:
 p=Path(path)
 if p.exists():
  b=p.read_bytes();links.append({'path':path,'bytes':len(b),'sha256':sha(b),'copied':False})
write_json(BASE/'existing-artifact-links.json',links)
write_json(BASE/'source-pin-boundaries.json',{'base':G,'acceptedBackendS':S,'stylisticSuccessorT':T,'knownPreFenceWipGitBlobs':{'relay/sheet/account-service.ts':'10be1d686ceeb859d305f1b4c2ff2576fc4b8509','relay/sheet/service.ts':'abf920fadd7b0a2cf20d91b2b91726a4ac3e5c6a'},'finalReviewedSGitBlobs':{'relay/sheet/account-service.ts':'c23ceea437f7e0fca1ad6e3e31d7400030b612b4','relay/sheet/websocket.ts':'b7632c8b68939c36dfafed616e2ac4c0ce8cb4a3'},'bindingMethod':'Exact original command/result record and timestamp + original production delta chronology + final immutable source objects. RED ran in dirty owned source, never on S. Historical missing per-command exit/source hashes are explicitly not invented.','lint':'S joined lint firstFAIL linked unchanged; T one-file lint PASS and strict PASS extracted. No final full-backend S/T lint was run by this author.','notRunByAuthor':['actual configured IdP plus Sheet authenticated browser matrix','actual PG locks/RLS/migration registration/application','fixed-port runtime/restart product qualification','new whole201/Word/Core/root preflight','tests after T stylistic followup']})
write_json(BASE/'groups.json',receipts)
# Reconstruct historical WIP hashes from final Git objects and exact inverse edits.
# Derived source pins are labelled; these are not original source snapshot files.
critical=['account-authority.ts','account-service.ts','service.ts','websocket.ts']
prefix='experiments/office-suite-v2/relay/sheet/'
current={prefix+p:subprocess.check_output(['git','-C',str(REPO),'show',S+':'+prefix+p]).decode() for p in critical}
def reverse_patch(state,patch):
 lines=patch.splitlines();pos=0
 while pos<len(lines):
  if not lines[pos].startswith('*** Update File: '):pos+=1;continue
  path=lines[pos].split('*** Update File: ',1)[1]
  rel=path.split(str(REPO)+'/',1)[-1];pos+=1;hunks=[];hunk=[]
  while pos<len(lines) and not lines[pos].startswith('*** '):
   line=lines[pos];pos+=1
   if line.startswith('@@'):
    if hunk:hunks.append(hunk)
    hunk=[]
   else:hunk.append(line)
  if hunk:hunks.append(hunk)
  if rel not in state:continue
  text=state[rel];cursor=0
  for hunk in hunks:
   before=[v[1:] for v in hunk if v.startswith((' ','+'))]
   after=[v[1:] for v in hunk if v.startswith((' ','-'))]
   needle='\n'.join(before)+'\n';replacement='\n'.join(after)+'\n'
   at=text.find(needle,cursor)
   if at<0:raise RuntimeError('cannot reverse exact source hunk: '+rel)
   text=text[:at]+replacement+text[at+len(needle):];cursor=at+len(replacement)
  state[rel]=text
stages={'final-S':dict(current)}
for call_id,name in [('call_ffe45f4e933e4a02abdbb50f52c64010','before-publication-fence'),('call_16d7b12d9cda4c4489bbfc2480cce035','before-expiry-priority-repair'),('call_33c89fe6a75242e2a183f348eaf737ed','before-native-deadline-logout-fences'),('call_4d9fb7e8814049259cdf5f55892f0923','before-postcommit-ws-fix')]:
 for item in patches:
  if item['callId']==call_id:reverse_patch(current,item['patch'])
 stages[name]=dict(current)
rows=[]
for stage,files in stages.items():
 for path,source in files.items():
  b=source.encode();blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
  rows.append({'stage':stage,'path':path,'gitBlob':blob,'bytes':len(b),'sha256':sha(b),'derived':stage!='final-S','derivation':'Exact inverse recorded production deltas from immutable S; product files were not read or changed during reconstruction.'})
known={'account-service.ts':'10be1d686ceeb859d305f1b4c2ff2576fc4b8509','service.ts':'abf920fadd7b0a2cf20d91b2b91726a4ac3e5c6a'}
for path,expected in known.items():
 actual=next(r['gitBlob'] for r in rows if r['stage']=='before-native-deadline-logout-fences' and r['path']==prefix+path)
 if actual!=expected:raise RuntimeError('reconstructed source differs from contemporaneous helper hash '+path)
copy=json.load(open('/Users/user/barocss-editor/.omx/m0/534-sheet-account-execute-frozen-copy-receipt.json'))['copied']
for path in ['account-authority.ts']:
 r=next(r for r in rows if r['stage']=='before-postcommit-ws-fix' and r['path']==prefix+path)
 if r['sha256']!=copy[prefix+path]['sha256']:raise RuntimeError('original copied source mismatch '+path)
write_json(BASE/'source-stages.json',{'derivationVerifiedAgainstContemporaneousWipBlobs':True,'originalAuthorityCopySha256Matched':True,'wsBaselineNote':'Before first recorded WS repair is derived from final S and its exact recorded repair; earlier WIP already differed from frozen copied WS. It is not labelled original copied WS.','sourceRows':rows,'groupBindings':{'postcommit-red':'before-postcommit-ws-fix','postcommit-green':'before-native-deadline-logout-fences','precommit-red':'before-native-deadline-logout-fences','authority-red':'before-native-deadline-logout-fences','precommit-authority-green':'before-expiry-priority-repair','strict-eight':'before-expiry-priority-repair','combined49-and-http3':'before-expiry-priority-repair','priority-repair-green':'before-publication-fence','publication-red':'before-publication-fence','transport-final-green':'final-S','style-lint-green':'T referenced in source-objects.json','style-types-green':'T referenced in source-objects.json'}})

# Manifest covers every stable artifact except itself and its sidecar, which bind each other externally.
files=[]
for p in sorted(BASE.rglob('*')):
 if p.is_file() and p.name not in ['manifest.json','manifest.sha256.txt']:
  b=p.read_bytes();files.append({'path':str(p.relative_to(BASE)),'bytes':len(b),'sha256':sha(b)})
write_json(BASE/'manifest.json',{'artifactType':'source-bound-original-check-receipts','owner':'Execute Sheet Accounts','reexecutedChecks':False,'sourceS':S,'sourceT':T,'files':files})
b=(BASE/'manifest.json').read_bytes();(BASE/'manifest.sha256.txt').write_text(sha(b)+'  manifest.json\n')
print(json.dumps({'groups':len(receipts),'artifacts':len(files),'manifestBytes':len(b),'manifestSha256':sha(b),'groupSummaries':[{'group':x['group'],'exit':x['exitCodesAsActuallyCaptured'],'tap':x['tapSummaries']} for x in receipts]},ensure_ascii=False))
