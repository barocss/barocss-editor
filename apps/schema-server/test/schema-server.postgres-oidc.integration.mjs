import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, realpathSync, readdirSync, statSync, existsSync, createWriteStream, cpSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

// Actual own compiled HTTP process/private PostgreSQL with controlled signed JWKS.
// No browser login, LLM, document schema adoption, MCP or external deployment claim.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const stageOnly=process.argv[2]==='--stage-only';
if(stageOnly && !process.argv[3])throw new Error('Stage destination is required');
const evidence=stageOnly?resolve(process.argv[3]):process.env.SCHEMA_SERVER_EVIDENCE;
if(stageOnly)assert.equal(existsSync(evidence),false,'Refuse existing artifact destination');
if(!evidence)throw new Error('SCHEMA_SERVER_EVIDENCE is required');
mkdirSync(evidence,{recursive:true,mode:0o700});
const privateRoot='/private/tmp/495-schema-pg-v2',socket=join(privateRoot,'socket'),data=join(privateRoot,'data');
if(!stageOnly){assert.equal(existsSync(privateRoot),false,'Refuse existing cluster; never take over another runtime');mkdirSync(socket,{recursive:true,mode:0o700});}
const bin=stageOnly?undefined:process.env.PG_BIN??execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const httpPort=14595,jwksPort=18595,pgPort=14596,issuer=`http://127.0.0.1:${jwksPort}/realm`;
const origin=`http://127.0.0.1:${httpPort}`;
const ids={tenant:'11111111-1111-4111-8111-111111111111',workspace:'22222222-2222-4222-8222-222222222222',schema:'33333333-3333-4333-8333-333333333333',otherSchema:'66666666-6666-4666-8666-666666666666',foreignTenant:'77777777-7777-4777-8777-777777777777',foreignWorkspace:'88888888-8888-4888-8888-888888888888'};
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const report={kind:'actual-independent-compiled-schema-http-private-postgres-controlled-signed-jwks',status:'incomplete',checks:[],notClaimed:['genuine browser/OIDC login','nativeformat2/pins/adoption','MCP','full495/Goal/alpha/release']};
const save=()=>writeFileSync(join(evidence,'server-proof.json'),JSON.stringify(report,null,2),{mode:0o600});
const check=async(name,work)=>{await work();report.checks.push({name,status:'passed'});save();console.log(JSON.stringify({check:name,result:'passed'}));};
const run=(name,args)=>execFileSync(join(bin,name),args,{encoding:'utf8',stdio:'pipe'});
const cfg=(user,database='schema_test')=>({host:socket,port:pgPort,user,database});
const clients=[],pools=[];let pgStarted=false,jwks,child,stage;const logs=[];
async function connect(user,database){const c=new pg.Client(cfg(user,database));await c.connect();clients.push(c);return c;}
function graph(directory){
  const files={},links={},visited=new Set();
  const walk=path=>{
    const real=realpathSync(path),stat=statSync(path);
    if(real!==path)links[path]=real;
    if(stat.isDirectory()){if(visited.has(real))return;visited.add(real);for(const name of readdirSync(path))walk(join(path,name));}
    else if(stat.isFile())files[real]=hash(readFileSync(path));
  };walk(resolve(directory));return {files,links};
}
function stageRuntime(target) {
  mkdirSync(target,{recursive:true,mode:0o700});const packages=new Map(),projection=[];
  function link(path,to){mkdirSync(dirname(path),{recursive:true});const rel=relative(dirname(path),to);symlinkSync(rel,path,'dir');}
  function external(name,from){
    for(const parent of [from,...parents(from)]){const path=join(parent,'node_modules',name);if(existsSync(join(path,'package.json')))return copyPackage(realpathSync(path));}
    throw new Error(`Locked runtime dependency unavailable: ${name}`);
  }
  function* parents(path){let previous;while(path!==previous){previous=path;path=dirname(path);yield path;}}
  function copyPackage(source){
    if(packages.has(source))return packages.get(source);const manifest=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
    const out=join(target,'.runtime-packages',`${manifest.name.replaceAll('/','_')}@${manifest.version}-${hash(source).slice(0,8)}`);
    packages.set(source,out);mkdirSync(out,{recursive:true});
    for(const entry of readdirSync(source))if(entry!=='node_modules')cpSync(join(source,entry),join(out,entry),{recursive:true,dereference:true});
    projection.push({name:manifest.name,version:manifest.version,sourcePackage:join(source,'package.json'),sourcePackageHash:hash(readFileSync(join(source,'package.json'))),kind:'locked-external-copy'});
    for(const dependency of Object.keys(manifest.dependencies??{}))link(join(out,'node_modules',dependency),external(dependency,source));
    for(const dependency of Object.keys(manifest.peerDependencies??{})){
      if(existsSync(join(out,'node_modules',dependency)))continue;
      try{link(join(out,'node_modules',dependency),external(dependency,source));}
      catch(error){if(!manifest.peerDependenciesMeta?.[dependency]?.optional)throw error;}
    }
    for(const dependency of Object.keys(manifest.optionalDependencies??{})){try{if(!existsSync(join(out,'node_modules',dependency)))link(join(out,'node_modules',dependency),external(dependency,source));}catch{/* Absent optional package is not installed or executed. */}}
    return out;
  }
  const entries=[
    ['packages/schema',['registry-contract.js'],{'./registry-contract':'./dist/registry-contract.js'},{}],
    ['apps/office-service',['schema-registry-store.js','membership-store.js','tenant-store.js'],{'./schema-registry-store':'./dist/schema-registry-store.js','./membership-store':'./dist/membership-store.js'},{'@barocss/schema':'workspace:^','@barocss/office-note-file':'workspace:^'}],
    ['apps/office-api',['oidc.js','auth-config.js'],{'./oidc':'./dist/oidc.js','./auth-config':'./dist/auth-config.js'},{jose:'6.2.12'}],
    ['packages/office-note-file',null,{'.':'./dist/index.js'},{}]
  ];
  const workspace=new Map();
  for(const [name,files,exports,dependencies] of entries){
    const source=join(root,name),original=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
    const out=join(target,'.runtime-packages',original.name.replaceAll('/','_'));workspace.set(original.name,out);mkdirSync(join(out,'dist'),{recursive:true});
    if(files)for(const file of files)cpSync(join(source,'dist',file),join(out,'dist',file));else cpSync(join(source,'dist'),join(out,'dist'),{recursive:true});
    writeFileSync(join(out,'package.json'),JSON.stringify({name:original.name,version:original.version,type:'module',exports,dependencies},null,2));
    projection.push({name:original.name,sourcePackage:join(source,'package.json'),sourcePackageHash:hash(readFileSync(join(source,'package.json'))),kind:'compiled-runtime-subpath-projection',exports,dependencies,files});
  }
  for(const out of workspace.values()){const manifest=JSON.parse(readFileSync(join(out,'package.json'),'utf8'));
    for(const dependency of Object.keys(manifest.dependencies??{}))link(join(out,'node_modules',dependency),workspace.get(dependency)??external(dependency,join(root,'apps/schema-server')));
  }
  cpSync(join(root,'apps/schema-server/dist'),join(target,'dist'),{recursive:true});
  const app=JSON.parse(readFileSync(join(root,'apps/schema-server/package.json'),'utf8'));
  const projectedApp={name:app.name,version:app.version,type:'module',scripts:{start:'node dist/main.js'},dependencies:app.dependencies};
  writeFileSync(join(target,'package.json'),JSON.stringify(projectedApp,null,2));
  projection.push({name:app.name,sourcePackage:join(root,'apps/schema-server/package.json'),sourcePackageHash:hash(readFileSync(join(root,'apps/schema-server/package.json'))),kind:'compiled-app-runtime-projection',projected:projectedApp});
  for(const dependency of Object.keys(app.dependencies))link(join(target,'node_modules',dependency),workspace.get(dependency)??external(dependency,join(root,'apps/schema-server')));
  cpSync(join(root,'apps/schema-server/README.md'),join(target,'README.md'));
  writeFileSync(join(evidence,'runtime-package-projection.json'),JSON.stringify(projection,null,2));
}
let stageBefore;
async function startServer(policyFile,label){
  const log=join(evidence,`${label}.log`);logs.push(log);const out=createWriteStream(log,{mode:0o600});
  const env={...process.env,NODE_DEBUG:'esm,module',SCHEMA_SERVER_HOST:'127.0.0.1',SCHEMA_SERVER_PORT:String(httpPort),SCHEMA_SERVER_POLICY_FILE:policyFile,
    SCHEMA_SERVER_OIDC_ISSUER:issuer,SCHEMA_SERVER_OIDC_JWKS_URL:`http://127.0.0.1:${jwksPort}/keys`,SCHEMA_SERVER_OIDC_AUDIENCE:'schema-test',
    SCHEMA_SERVER_DATABASE_URL:`postgresql:///schema_test?host=${encodeURIComponent(socket)}&port=${pgPort}&user=wonffice_app`};
  child=spawn(process.execPath,[join(stage,'dist/main.js')],{cwd:stage,env,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(out);child.stderr.pipe(out);
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  child.proofExit=exit;child.proofLog=out;
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)throw new Error('Compiled server exited before readiness');
    try{if((await fetch(origin+'/health/ready')).status===200)return;}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Compiled server did not become ready');
}
async function stopServer(){
  if(!child)return;
  const current=child;child=undefined;current.kill('SIGTERM');
  let timer;let result;
  try{result=await Promise.race([current.proofExit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Shutdown deadline exceeded')),12000);})]);}finally{clearTimeout(timer);}
  assert.deepEqual(result,{code:0,signal:null});await new Promise(resolve=>current.proofLog.end(resolve));
}
const definition=(schemaId=ids.schema,version=1,parent=null,dependencies=[],number=false)=>({dialect:'wonffice.note-fields.v1',scope:{tenantId:ids.tenant,workspaceId:ids.workspace},schemaId,version,parent,dependencies,requiredCapabilities:[number?'note.field.number.v1':'note.field.text.v1'],dataset:{name:number?'Numbers':'Tasks',fields:[{name:number?'Amount':'Title',kind:number?'number':'text'}]}});
const base=`/v1/tenants/${ids.tenant}/workspaces/${ids.workspace}`;
let owner,token,policyFile;
const send=async(method,path,body,who='writer')=>{
 const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${await token(who)}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
};
const register=(value,key,who='writer',text=JSON.stringify(value,null,2))=>send('PUT',base+`/schemas/${value.schemaId}/versions/${value.version}`,{definitionText:text,idempotencyKey:key},who);
if(stageOnly){
  stageRuntime(evidence);const binding=graph(evidence);
  writeFileSync(join(evidence,'artifact-binding.json'),JSON.stringify(binding,null,2));
  console.log(JSON.stringify({event:'schema_runtime_staged',destination:evidence,files:Object.keys(binding.files).length}));
}else{
try{
  assert.equal(process.version,'v22.22.0');
  const {migrate}=await import('../../office-service/dist/migrate.js');
  const {applyMembershipChange}=await import('../../office-service/dist/membership-admin.js');
  const {DocumentStore}=await import('../../office-service/dist/document-store.js');
  stage=process.env.SCHEMA_SERVER_ARTIFACT?resolve(process.env.SCHEMA_SERVER_ARTIFACT):join(evidence,'staged-runtime');
  if(process.env.SCHEMA_SERVER_ARTIFACT){
    const declared=JSON.parse(readFileSync(join(stage,'artifact-binding.json'),'utf8'));const actual=graph(stage);delete actual.files[realpathSync(join(stage,'artifact-binding.json'))];assert.deepEqual(actual,declared);
  }else stageRuntime(stage);
  assert.ok(existsSync(join(stage,'dist/main.js')));assert.equal(existsSync(join(stage,'src')),false);
  stageBefore=graph(stage);writeFileSync(join(evidence,'runtime-stage-before.json'),JSON.stringify(stageBefore,null,2));
  run('initdb',['-D',data,'-U','schema_test_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(privateRoot,'postgres.log'),'-o',`-k ${socket} -h '' -p ${pgPort}`,'-w','start']);pgStarted=true;
  const admin=await connect('schema_test_admin','postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE schema_test OWNER wonffice_owner');
  owner=await connect('wonffice_owner');const applied=await migrate(owner);assert.equal(applied.at(-1),'0016_schema_registry');
  const {privateKey,publicKey}=await generateKeyPair('RS256');const publicJwk={...await exportJWK(publicKey),kid:'schema-test-key',alg:'RS256',use:'sig'};
  jwks=createServer((request,response)=>{if(request.url==='/keys'){response.setHeader('content-type','application/json');response.end(JSON.stringify({keys:[publicJwk]}));}else{response.statusCode=404;response.end();}});
  await new Promise((resolve,reject)=>{jwks.once('error',reject);jwks.listen(jwksPort,'127.0.0.1',resolve);});
  token=async(subject,options={})=>new SignJWT({typ:options.typ??'Bearer'}).setProtectedHeader({alg:'RS256',kid:'schema-test-key'}).setIssuer(issuer).setAudience(options.audience??'schema-test').setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  for(const [subject,role] of [['writer','editor'],['viewer','viewer']]){
    if(subject==='writer')await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:ids.tenant,tenantName:'Schema Alpha',issuer,subject:'operator',approvalRef:'schema-test-owner'});
    await applyMembershipChange(owner,{action:'grant',tenantId:ids.tenant,issuer,subject,role,approvalRef:`schema-test-${subject}`});
  }
  await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:ids.foreignTenant,tenantName:'Schema Foreign',issuer,subject:'foreign',approvalRef:'schema-test-foreign'});
  await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3),($4,$5,$6)',[ids.tenant,ids.workspace,'Schema workspace',ids.foreignTenant,ids.foreignWorkspace,'Foreign workspace']);
  const writerId=(await owner.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2',[issuer,'writer'])).rows[0].id;
  const pool=new pg.Pool({...cfg('wonffice_app'),max:2});pools.push(pool);
  const source={stype:'note',attributes:{title:'Preserved legacy',pageId:'source-page'},content:[{stype:'paragraph',content:[{stype:'inline-text',text:'Exact legacy body',marks:[{stype:'bold',range:[0,5]}]},{stype:'pageReference',attributes:{pageId:'source-page',title:'Self'}}]}]};
  const sourceText=JSON.stringify({format:'barocss-note',version:1,savedAt:'authored old stamp',document:source},null,2)+'\n';
  const original=await new DocumentStore(pool).create({issuer,subject:'writer'},ids.tenant,{workspaceId:ids.workspace,product:'note',title:'Preserved legacy',fileFormat:'barocss-note',fileVersion:1,snapshotText:sourceText,idempotencyKey:'legacy-source',importMode:'new-page-copy'});
  const expectedNative=structuredClone(source);expectedNative.attributes.pageId=original.document.pageId;expectedNative.content[0].content[1].attributes.pageId=original.document.pageId;
  const expectedNativeText=JSON.stringify({format:'barocss-note',version:1,savedAt:'authored old stamp',document:expectedNative},null,2)+'\n';assert.equal(original.snapshotText,expectedNativeText);
  const policy=[{tenantId:ids.tenant,workspaceId:ids.workspace,readRoles:['editor','viewer'],registerRoles:['editor'],capabilities:['note.field.text.v1','note.field.number.v1','note.field.boolean.v1','note.field.choice.v1']}];
  policyFile=join(evidence,'operator-policy.json');writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
  await startServer(policyFile,'server-first');
  await check('own compiled staged process/live/actual DB readiness; no source TypeScript entry',async()=>{
    assert.equal((await fetch(origin+'/health/live')).status,200);assert.equal((await fetch(origin+'/health/ready')).status,200);
  });
  const value=definition(),text=JSON.stringify(value,null,2);
  const canonical=`{"dataset":{"fields":[{"kind":"text","name":"Title"}],"name":"Tasks"},"dependencies":[],"dialect":"wonffice.note-fields.v1","parent":null,"requiredCapabilities":["note.field.text.v1"],"schemaId":"${ids.schema}","scope":{"tenantId":"${ids.tenant}","workspaceId":"${ids.workspace}"},"version":1}`;
  let first,second,dependent;
  await check('authenticated immutable registration/original text/independent digest/actor-scoped exact retry',async()=>{
    first=await register(value,'first');assert.equal(first.status,200);assert.equal(first.body.record.definitionText,text);assert.deepEqual(first.body.record.definition,value);assert.equal(first.body.record.canonicalText,canonical);assert.equal(first.body.record.digest,hash(canonical));assert.equal(first.body.requesterIdentityId,writerId);assert.equal(first.body.record.actorIdentityId,writerId);
    assert.equal(first.body.requestHash,hash(JSON.stringify(['schema-register-v1',ids.tenant,ids.workspace,ids.schema,1,text])));
    assert.deepEqual((await register(value,'first')).body,first.body);assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
    const altered=await register(value,'first','writer',' '+text);assert.equal(altered.status,409);assert.equal(altered.body.status,'key_reuse');
    const conflict=await register({...value,dataset:{...value.dataset,name:'Conflict'}},'conflict');assert.equal(conflict.status,409);assert.equal(conflict.body.status,'immutable_version_conflict');
    const equivalent=await register(value,'equivalent','writer',JSON.stringify(value));assert.equal(equivalent.status,200);assert.equal(equivalent.body.record.definitionText,text);
  });
  await check('exact parent and complete immutable dependency reads; missing/cycle/unsupported reject atomically',async()=>{
    const ref={schemaId:ids.schema,version:1,digest:hash(canonical)};
    second=await register(definition(ids.schema,2,ref),'second');assert.equal(second.status,200);assert.deepEqual(second.body.dependencies,[first.body.record]);
    dependent=await register(definition(ids.otherSchema,1,null,[ref],true),'dependent');assert.equal(dependent.status,200);assert.deepEqual(dependent.body.dependencies,[first.body.record]);
    const get=await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`);assert.deepEqual(get.body,{record:dependent.body.record,dependencies:[first.body.record]});
    const counts=await owner.query('SELECT (SELECT count(*)::int FROM wonffice.schema_versions) AS versions,(SELECT count(*)::int FROM wonffice.schema_registry_receipts) AS receipts');
    for(const [key,invalid] of [['missing',definition('99999999-9999-4999-8999-999999999999',1,null,[{...ref,schemaId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}])],['cycle',definition('99999999-9999-4999-8999-999999999999',1,null,[{...ref,schemaId:'99999999-9999-4999-8999-999999999999'}])],['unsupported',{...definition('99999999-9999-4999-8999-999999999999'),validator:'execute()'}]])assert.equal((await register(invalid,key)).status,422);
    assert.deepEqual((await owner.query('SELECT (SELECT count(*)::int FROM wonffice.schema_versions) AS versions,(SELECT count(*)::int FROM wonffice.schema_registry_receipts) AS receipts')).rows,counts.rows);
  });
  await check('real current writer/viewer/foreign/invalid-token authorization and preserved legacy native',async()=>{
    assert.equal((await register(value,'viewer-denied','viewer')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.schema}/versions/1`,undefined,'viewer')).status,200);
    assert.equal((await send('GET',base+'/schema-receipts/first',undefined,'viewer')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.schema}/versions/1`,undefined,'foreign')).status,403);
    const bad=await fetch(origin+base+`/schemas/${ids.schema}/versions/1`,{headers:{authorization:`Bearer ${await token('writer',{typ:'ID'})}`}});assert.equal(bad.status,401);
    const legacy=await send('GET',base+`/documents/${original.document.documentId}/schema-bundle`);assert.deepEqual(legacy.body,{status:'legacy_unpinned',documentId:original.document.documentId,documentRevision:1,snapshotHash:hash(expectedNativeText),nativeFormat:{format:'barocss-note',version:1}});
    assert.equal((await owner.query('SELECT snapshot_text FROM wonffice.document_snapshots WHERE tenant_id=$1 AND document_id=$2',[ids.tenant,original.document.documentId])).rows[0].snapshot_text,expectedNativeText);
  });
  await check('current revocation denies record and fixed receipt without a new effect',async()=>{
    await applyMembershipChange(owner,{action:'revoke',tenantId:ids.tenant,issuer,subject:'writer',role:'editor',approvalRef:'schema-test-revoke'});
    assert.equal((await register(value,'first')).status,403);assert.equal((await send('GET',base+'/schema-receipts/first')).status,403);
    await applyMembershipChange(owner,{action:'grant',tenantId:ids.tenant,issuer,subject:'writer',role:'editor',approvalRef:'schema-test-restore'});
    assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
  });
  await check('SIGTERM only-owned listener/pool cleanup leaves controlled JWKS available',async()=>{await stopServer();assert.equal((await fetch(`http://127.0.0.1:${jwksPort}/keys`)).status,200);});
  await check('database AND server restart preserve exact definitions/receipts/native bytes',async()=>{
    for(const p of pools)await p.end();for(const c of clients)await c.end();
    run('pg_ctl',['-D',data,'-m','fast','-w','stop']);pgStarted=false;
    run('pg_ctl',['-D',data,'-l',join(privateRoot,'postgres.log'),'-o',`-k ${socket} -h '' -p ${pgPort}`,'-w','start']);pgStarted=true;
    owner=await connect('wonffice_owner');await startServer(policyFile,'server-restarted');
    assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);assert.deepEqual((await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`)).body,{record:dependent.body.record,dependencies:[first.body.record]});
    assert.equal((await owner.query('SELECT snapshot_text FROM wonffice.document_snapshots WHERE document_id=$1',[original.document.documentId])).rows[0].snapshot_text,expectedNativeText);
  });
  await check('operator capability removal gates original actor receipt and dependency reads on restart',async()=>{
    await stopServer();const restricted=join(evidence,'operator-policy-restricted.json');writeFileSync(restricted,JSON.stringify([{...policy[0],capabilities:['note.field.number.v1']}]),{mode:0o600});
    await startServer(restricted,'server-restricted');assert.equal((await send('GET',base+'/schema-receipts/first')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`)).status,403);
    await stopServer();await startServer(policyFile,'server-restored-policy');assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
  });
  await check('actual DB-down readiness503 while process remains live',async()=>{
    await owner.end();run('pg_ctl',['-D',data,'-m','fast','-w','stop']);pgStarted=false;
    assert.equal((await fetch(origin+'/health/live')).status,200);assert.equal((await fetch(origin+'/health/ready')).status,503);
  });
  await stopServer();
  const after=graph(stage);writeFileSync(join(evidence,'runtime-stage-after.json'),JSON.stringify(after,null,2));assert.deepEqual(after,stageBefore);
  const loaded=new Set();
  for(const log of logs){const text=readFileSync(log,'utf8');for(const match of text.matchAll(/file:\/\/\/[^\s'"),}]+|\/[^\s'"),}]+\.(?:js|cjs|mjs|json|node)/g)){
    let path;try{path=match[0].startsWith('file:')?fileURLToPath(match[0]):match[0];if(existsSync(path)&&statSync(path).isFile())loaded.add(realpathSync(path));}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
  }}
  assert.ok(loaded.has(realpathSync(join(stage,'dist/main.js'))),'Actual module trace must include staged main');
  for(const path of loaded){assert.ok(Object.hasOwn(stageBefore.files,path),`Loaded file outside bound runtime graph: ${path}`);assert.equal(/\.(?:ts|tsx)$/.test(path),false);}
  writeFileSync(join(evidence,'runtime-loaded.json'),JSON.stringify([...loaded].sort().map(path=>({path,sha256:stageBefore.files[path]})),null,2));
  report.runtime={boundFiles:Object.keys(stageBefore.files).length,loadedFiles:loaded.size,unchanged:true,noRepositoryTypeScript:true};report.status='passed';save();
} catch(error){report.status='failed';report.failure=String(error);save();throw error;}
finally{
  let clean=true;try{if(child)await stopServer();}catch{clean=false;}
  if(jwks)await new Promise(resolve=>jwks.close(resolve));
  for(const p of pools)try{await p.end();}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
  for(const c of clients)try{await c.end();}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
  if(pgStarted)try{run('pg_ctl',['-D',data,'-m','fast','-w','stop']);}catch{clean=false;}
  report.cleanup=clean;if(!clean)report.status='failed';save();
}
if(!report.cleanup)throw new Error('Only-owned cleanup failed');

}
