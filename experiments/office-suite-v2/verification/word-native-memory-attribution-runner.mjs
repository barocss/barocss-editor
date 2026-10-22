/** ONE diagnostic attempt. All normal performance files remain unchanged. */
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadavg} from 'node:os';
import {environment,sourceBinding} from './metrics.ts';
import {ownedBrowserMemory,createSampleWallGuard} from './performance-guards.ts';
import {diagnosticStamp,diagnosticRead} from './word-memory-diagnostic-record.ts';
import {NativeMemoryRecorder,isMissingNativeMethod} from './word-native-memory-attribution-record.ts';

const here=dirname(fileURLToPath(import.meta.url));
if(process.version!=='v22.22.0')throw new Error('Diagnostic requires Node22.22.0');
const protocolPath=resolve(here,'reports/word-native-memory-attribution-protocol-v1.json');
const protocolBytes=readFileSync(protocolPath),protocol=JSON.parse(protocolBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const leasePath=process.env.M0_WORD_NATIVE_MEMORY_ATTRIBUTION_LEASE;
if(!leasePath)throw new Error('A new diagnostic-kind Integration lease is required; no browser started');
const leaseBytes=readFileSync(leasePath),lease=JSON.parse(leaseBytes);
if(lease.status!=='granted'||lease.kind!=='diagnostic-word-native-memory-attribution-v1'||lease.max_runs!==1||lease.port!==55260||lease.protocol_sha256!==sha(protocolBytes))throw new Error('Diagnostic lease/protocol mismatch; no browser started');
if(!Number.isFinite(Date.parse(lease.deadline_utc))||Date.parse(lease.deadline_utc)<=Date.now()||!/^[a-f0-9]{40}$/.test(lease.source_head))throw new Error('Expired or unpinned diagnostic lease');
if(process.argv.length!==2)throw new Error('This diagnostic accepts no sample count or workload overrides');
const root=lease.source_root,requireRoot=createRequire(resolve(root,'package.json'));
const harnessFiles=['word-native-memory-attribution-runner.mjs','word-native-memory-attribution-browser.mjs','word-native-memory-attribution-record.ts','word-native-memory-attribution.html','reports/word-native-memory-attribution-protocol-v1.json'];
for(const file of protocol.productionFiles){
 const bytes=readFileSync(resolve(root,file.path));
 if(sha(bytes)!==file.sha256||!bytes.equals(execFileSync('git',['show',`${lease.source_head}:${file.path}`],{cwd:root})))throw new Error('Production source differs from immutable ee61 renderer531 closure: '+file.path);
}
for(const file of [...protocol.normalHarnessFiles,...protocol.readOnlySupportFiles,protocol.referenceFontReport]){
 const bytes=readFileSync(resolve(here,file.path)),path='experiments/office-suite-v2/verification/'+file.path;
 if(sha(bytes)!==file.sha256||!bytes.equals(readFileSync(resolve(root,path)))||!bytes.equals(execFileSync('git',['show',`${lease.source_head}:${path}`],{cwd:root})))throw new Error('Normal harness/reference font report changed: '+file.path);
}
for(const file of harnessFiles){const path='experiments/office-suite-v2/verification/'+file;if(!readFileSync(resolve(here,file)).equals(execFileSync('git',['show',`${lease.source_head}:${path}`],{cwd:root})))throw new Error('Diagnostic harness not committed at lease pin: '+file);}
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==lease.source_head||execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw new Error('Lease source root must be exact pinned clean HEAD');
if(!/^[a-f0-9]{40}$/.test(lease.source_tree)||execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim()!==lease.source_tree)throw new Error('Lease source tree mismatch');
const budgetPath='experiments/office-suite-v2/verification/reports/reference-budget-v1.1.json';
if(sha(readFileSync(resolve(here,'reports/reference-budget-v1.1.json')))!==protocol.frozenBudgetSha256||sha(readFileSync(resolve(root,budgetPath)))!==protocol.frozenBudgetSha256||sha(execFileSync('git',['show',`${lease.source_head}:${budgetPath}`],{cwd:root}))!==protocol.frozenBudgetSha256)throw new Error('Frozen budget changed');
const playwrightPackage=requireRoot.resolve('playwright/package.json');
const corePackage=createRequire(playwrightPackage).resolve('playwright-core/package.json');
const protocolTypesPath=resolve(dirname(corePackage),'types/protocol.d.ts');
if(sha(readFileSync(protocolTypesPath))!==protocol.pinnedProtocol.sha256)throw new Error('Pinned browser protocol types changed');
const {createServer}=await import(resolve(dirname(requireRoot.resolve('vite/package.json')),'dist/node/index.js'));
const {chromium}=requireRoot('playwright');
const runId=new Date().toISOString().replace(/[:.]/g,'-'),out=resolve(here,'reports','word-native-memory-attribution-'+runId);
mkdirSync(out,{recursive:true});
const sourceFiles=[...protocol.productionFiles.map(f=>f.path),...protocol.normalHarnessFiles.map(f=>'experiments/office-suite-v2/verification/'+f.path),...protocol.readOnlySupportFiles.map(f=>'experiments/office-suite-v2/verification/'+f.path),...harnessFiles.map(f=>'experiments/office-suite-v2/verification/'+f),'experiments/office-suite-v2/verification/'+protocol.referenceFontReport.path];
const report={schema:'office-v2-m0/word-native-memory-attribution-v1',status:'NOT RUN: diagnostic only',runId,lease,leaseSha256:sha(leaseBytes),protocolSha256:sha(protocolBytes),protocol,environment:environment(),source:sourceBinding(root,[...new Set(sourceFiles)]),seams:[],operations:[],rssPolls:[],consoleErrors:[],pageErrors:[],nativeSampling:null,limits:protocol.limits};
const save=()=>writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const claimDir=resolve(here,'.cache');mkdirSync(claimDir,{recursive:true});
writeFileSync(resolve(claimDir,'word-native-memory-attribution-v1-attempt.json'),JSON.stringify({runId,sourceHead:lease.source_head,leaseSha256:report.leaseSha256,protocolSha256:report.protocolSha256}),{flag:'wx'});
save();
function pressure(){
 const options={encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1024*1024};
 const vm=execFileSync('vm_stat',options),memory=execFileSync('memory_pressure',['-Q'],options);
 const count=name=>Number(new RegExp(`^${name}:\\s+(\\d+)`,'m').exec(vm)?.[1]??NaN);
 return {at:diagnosticStamp(),load:loadavg(),pageBytes:Number(/page size of (\d+) bytes/.exec(vm)?.[1]??NaN),memoryFreePercent:Number(/free percentage:\s+(\d+)/.exec(memory)?.[1]??NaN),swapins:count('Swapins'),swapouts:count('Swapouts'),swapusage:execFileSync('sysctl',['vm.swapusage'],options).trim()};
}
const vite=await createServer({configFile:false,root:here,cacheDir:resolve(here,'.cache/vite-native-memory-attribution-v1'),optimizeDeps:{entries:['word-native-memory-attribution.html']},resolve:{alias:{'@m0-word-runtime':resolve(root,'apps/word/src/runtime.ts'),'@m0-word-css':resolve(root,'packages/office-word/src/ui.css'),'@m0-text-css':resolve(root,'packages/office-text/src/text.css')}},server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,root]}},logLevel:'warn'});
let server,browser,launchPending,monitor,wall,rootPid,phase='setup',page,cdp,browserCdp,sampler;
const activeReads=new Set();
const abortReads=reason=>{for(const read of activeReads){if(read.status==='RUNNING'){read.status='ABORTED';read.error??=reason;read.ended=diagnosticStamp();read.collectionSkewMs=read.ended.monotonicMs-read.started.monotonicMs;}}};
const observedRead=(name,operation,assign)=>diagnosticRead(name,operation,diagnosticStamp,read=>{assign(read);if(read.status==='RUNNING')activeReads.add(read);else activeReads.delete(read);save();});
let rejectFailure=()=>{};
const failure=new Promise((_,reject)=>{rejectFailure=reject;});void failure.catch(()=>{});
const failClosed=(reason,urgentKill=false)=>{report.guardFailure??=reason;report.firstFailure??=reason;report.status='DIAGNOSTIC FAILED: recorded guard/console/monitor error';process.exitCode=1;abortReads(reason);rejectFailure(new Error(reason));if(urgentKill){report.urgentOwnedKill=reason;void server?.kill().catch(()=>{});}save();};
const check=()=>{wall.remainingMs();if(report.guardFailure)throw new Error(report.guardFailure);if(Date.now()>=Date.parse(lease.deadline_utc))throw new Error('Diagnostic lease expired');};
const bounded=operation=>Promise.race([wall.run(operation),failure]);
function rss(){
 const started=diagnosticStamp();let memory;
 try{
  memory=ownedBrowserMemory(execFileSync('ps',['-axo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:1500,killSignal:'SIGKILL',maxBuffer:2*1024*1024}),rootPid);
  if(!memory.rootPresent)throw new Error('Owned PID absent from diagnostic memory read');
  if(memory.aggregateRssBytes>protocol.guards.ownedAggregateRssBytes)throw new Error('Owned aggregate RSS exceeded2GiB');
  return memory;
 }catch(error){report.failedResourceRead??={started,ended:diagnosticStamp(),phase,error:String(error),availableOwnedMemory:memory??null};save();if(memory?.aggregateRssBytes>protocol.guards.ownedAggregateRssBytes)failClosed('Owned aggregate RSS exceeded2GiB',true);throw error;}
}
async function stage(name,limitMs,operation){
 check();phase=name;const row={name,started:diagnosticStamp(),status:'RUNNING'};report.operations.push(row);save();
 const deadline=row.started.monotonicMs+limitMs;
 const timer=setTimeout(()=>failClosed(name+' exceeded'+limitMs+'ms'),limitMs);
 try{const value=await bounded(operation);if(performance.now()>=deadline){row.returnedAfterLimit=value;failClosed(name+' settled after'+limitMs+'ms deadline');throw new Error(report.guardFailure);}check();row.status='COMPLETED diagnostic operation';return value;}
 catch(error){row.status='FAILED';row.error=String(error);throw error;}
 finally{clearTimeout(timer);row.ended=diagnosticStamp();save();}
}
let roleUnavailable=null;
async function roles(){
 if(roleUnavailable)return {status:'unavailable',reason:roleUnavailable,rootMatches:false,processInfo:[]};
 try{
  const value=await sampler.command('SystemInfo.getProcessInfo');
  if(!Array.isArray(value?.processInfo)||value.processInfo.some(p=>!Number.isInteger(p.id)||typeof p.type!=='string'||!Number.isFinite(p.cpuTime)))throw new Error('Invalid process-role metadata schema');
  const rootMatches=value.processInfo.some(p=>p.id===rootPid);
  return {status:rootMatches?'available-exact-PID-join':'unavailable-root-ID-mismatch',at:diagnosticStamp(),rootMatches,processInfo:value.processInfo.map(p=>({id:p.id,protocolReportedType:p.type,cpuTime:p.cpuTime})),basis:'Pinned SystemInfo.ProcessInfo and exact numeric match to owned OS PID; no guessed roles'};
 }catch(error){
  if(!isMissingNativeMethod(error))throw error;
  roleUnavailable='Verified structured -32601 for requested SystemInfo.getProcessInfo';
  return {status:'unavailable',reason:roleUnavailable,rootMatches:false,processInfo:[]};
 }
}
async function collect(name,edge=null,live=false){
 return stage('collect:'+name,10000,async()=>{
  const pair={name,edge,started:diagnosticStamp(),atomic:false,snapshots:[]};report.seams.push(pair);save();
  pair.processRoleMetadata=(await observedRead('process-role-metadata',roles,read=>{pair.processRoleRead=read;})).value;
  for(const side of ['before','after']){
   check();const snapshot={side,started:diagnosticStamp(),reads:{}};pair.snapshots.push(snapshot);save();
   snapshot.reads.ownedRss=await observedRead('owned-pid-rss',()=>{
    const value=rss();return {...value,processes:value.processes.map(p=>({...p,protocolReportedType:pair.processRoleMetadata.rootMatches?pair.processRoleMetadata.processInfo.find(q=>q.id===p.pid)?.protocolReportedType??null:null,roleBasis:'Exact protocol ID match only; null means unavailable'}))};
   },read=>{snapshot.reads.ownedRss=read;});save();
   snapshot.reads.page=await observedRead('page-numeric-snapshot',()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.snapshot()),read=>{snapshot.reads.page=read;});save();
   const state=snapshot.reads.page.value;
   if(live&&(state.native.rootId!==report.nativeOpen.result.rootId||state.native.surfaces!==1||state.native.pages!==100||state.native.paragraphs!==800))throw new Error('Live native root/surface/page/paragraph invariant changed');
   snapshot.reads.cdpPerformance=await observedRead('page-CDP-performance',async()=>{
    const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','LayoutCount','LayoutDuration'].includes(m.name)).map(m=>[m.name,m.value]));
    return {status:Number.isFinite(metrics.JSHeapUsedSize)&&Number.isFinite(metrics.JSHeapTotalSize)?'available':'unavailable',metrics};
   },read=>{snapshot.reads.cdpPerformance=read;});save();
   snapshot.reads.runtimeHeap=await observedRead('Runtime-isolate-heap-four-series',()=>sampler.heapUsage(),read=>{snapshot.reads.runtimeHeap=read;});save();
   snapshot.reads.nativeDom=await observedRead('native-CDP-DOM-counters',()=>cdp.send('Memory.getDOMCounters'),read=>{snapshot.reads.nativeDom=read;});snapshot.ended=diagnosticStamp();snapshot.collectionSkewMs=snapshot.ended.monotonicMs-snapshot.started.monotonicMs;save();
  }
  pair.ended=diagnosticStamp();pair.totalCollectionSkewMs=pair.ended.monotonicMs-pair.started.monotonicMs;save();return pair;
 });
}
try{
 const setup=createSampleWallGuard(5000,()=>{});try{await setup.run(()=>vite.listen());}finally{setup.stop();}
 report.systemBefore=pressure();report.status='RUNNING DIAGNOSTIC: no performance qualification';save();
 wall=createSampleWallGuard(protocol.guards.sampleWallMs,()=>failClosed('Diagnostic45s wall including browser startup'));
 report.sampleWallStarted=diagnosticStamp();
 await bounded(async()=>{
  launchPending=chromium.launchServer({host:'127.0.0.1',headless:true,executablePath:lease.browser_executable,args:['--enable-precise-memory-info'],timeout:wall.remainingMs()});
  server=await wall.run(()=>launchPending,value=>value.kill());rootPid=server.process().pid;report.ownedBrowserRootPid=rootPid;
  monitor=setInterval(()=>{try{report.rssPolls.push({at:diagnosticStamp(),phase,...rss()});}catch(error){report.monitorError??=String(error);failClosed('Diagnostic memory monitor: '+String(error));}},protocol.guards.pollMs);
  browser=await wall.run(()=>chromium.connect(server.wsEndpoint(),{timeout:wall.remainingMs()}),value=>value.close());report.browserVersion=browser.version();if(report.browserVersion!=='145.0.7632.6')throw new Error('Reference browser version changed');
  const context=await browser.newContext({viewport:protocol.input.viewport,deviceScaleFactor:1});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('console',m=>{if(m.type()==='error'){report.consoleErrors.push(m.text());failClosed('Diagnostic browser console error');}});page.on('pageerror',e=>{report.pageErrors.push(String(e));failClosed('Diagnostic page error');});
  await stage('module-navigation',10000,async()=>{await page.goto('http://127.0.0.1:55260/word-native-memory-attribution.html');await page.waitForFunction(()=>!!window.m0WordNativeMemoryAttribution);});
  cdp=await context.newCDPSession(page);browserCdp=await browser.newBrowserCDPSession();
  report.cdpScope={nativeSampling:'page-target CDP session created by context.newCDPSession(page)',runtimeHeap:'Same session, corresponding isolate total; not page/Runtime scoped',systemInfo:'Browser CDP session, optional exact OS PID role metadata only',nativeProfilePidJoin:'NONE: schema has no PID field; never automatically join nativeprofile to nearby RSS/role PIDs',pageUrl:page.url()};save();
  sampler=new NativeMemoryRecorder({send:(method,params)=>method==='SystemInfo.getProcessInfo'?browserCdp.send(method,params):cdp.send(method,params),remainingMs:()=>{check();return wall.remainingMs();},observe:()=>{if(report.nativeSampling)Object.assign(report.nativeSampling,{retainedProfileBytes:sampler.retainedProfileBytes,mayBeActive:sampler.mayBeActive,stopAttempted:sampler.stopAttempted});save();}});
  report.nativeSampling={commands:sampler.commands,windows:sampler.windows,cleanupRecords:sampler.cleanupRecords,retainedProfileBytes:0};save();
  report.performanceObserverSetup=await observedRead('Performance.enable-before-first-baseline',()=>cdp.send('Performance.enable'),read=>{report.performanceObserverSetup=read;});
  report.domCssEnable=await stage('enable-DOM-CSS-observers',10000,async()=>{await cdp.send('DOM.enable');await cdp.send('CSS.enable');return {note:'Deliberate observation intervention before cold open, matching normal harness order'};});
  await collect(protocol.seams[0]);
  await sampler.window('cold',async()=>{
   report.nativeOpen=await stage('combined-native-cold-open',10000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.open()));save();
   const opened=report.nativeOpen.result;if(opened.pages!==100||opened.paragraphs!==800||opened.surfaceCount!==1||opened.rootId!==opened.domRoot||opened.documentFaults.length)throw new Error('Native admission/root/surface/page/error invariant failed');return report.nativeOpen;
  },value=>collect(protocol.seams[1],value.edge,true));
  report.fontQuery=await stage('actual-font-query',10000,async()=>{
   const targets=await page.evaluate(()=>window.m0WordNativeMemoryAttribution.fonts());
   const fonts=[];const documentNode=(await cdp.send('DOM.getDocument',{depth:0})).root.nodeId;
   for(const target of targets.result){const node=(await cdp.send('DOM.querySelector',{nodeId:documentNode,selector:target.selector})).nodeId;const actual=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node})).fonts;if(!actual.length)throw new Error('Actual text-child font evidence absent');fonts.push({...target,actual});}
   const names=[...new Set(fonts.flatMap(t=>t.actual.map(f=>f.postScriptName)))].sort();
   const expected=JSON.parse(readFileSync(resolve(here,'reports/word-phase-c-diagnostic.json'),'utf8')).installedFontIdentity.fonts;
   if(JSON.stringify(names)!==JSON.stringify(expected.map(f=>f.actualPostScriptName).sort()))throw new Error('Actual font fallback changed');
   const installed=JSON.parse(execFileSync('python3',[resolve(here,'font-metadata.py'),JSON.stringify(names)],{encoding:'utf8',timeout:5000,killSignal:'SIGKILL'}));
   if(installed.fonts.length!==expected.length||!installed.fonts.every(f=>f.qualifiedIdentity&&expected.some(e=>e.actualPostScriptName===f.actualPostScriptName&&e.version===f.version&&e.sha256===f.sha256)))throw new Error('Actual font name/version/hash changed');
   return {targets,fonts,installed,qualifiedIdentity:true,edge:await page.evaluate(()=>window.m0WordNativeMemoryAttribution.snapshot())};
  });
  await collect(protocol.seams[2],report.fontQuery.edge,true);
  await sampler.window('warm',async()=>{
   report.warm=await stage('full-warm-native-completion',10000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.warm()));save();if(report.warm.result.pages!==100||report.warm.result.surfaceCount!==1)throw new Error('Warm native page/surface invariant failed');return report.warm;
  },value=>collect(protocol.seams[3],value.edge,true));
  await sampler.window('print',async()=>{
   report.print=await stage('synchronous-actual-print',15000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.print()));save();if(report.print.result.pages!==100)throw new Error('Actual print page count changed');return report.print;
  },value=>collect(protocol.seams[4],value.edge,true));
  report.deferred=await stage('explicit-layout-readout',10000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.deferredReadout()));
  await collect(protocol.seams[5],report.deferred.edge,true);
  report.clear=await stage('clearPrint',10000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.clearPrint()));if(report.clear.edge.native.printedPages!==0)throw new Error('clearPrint did not remove actual print pages');
  await collect(protocol.seams[6],report.clear.edge,true);
  report.dispose=await stage('runtime-dispose',10000,()=>page.evaluate(()=>window.m0WordNativeMemoryAttribution.dispose()));
  await collect(protocol.seams[7],report.dispose.edge);
  if(report.seams.length!==protocol.seams.length||report.seams.some(p=>p.snapshots.length!==2)||sampler.windows.length!==3)throw new Error('Diagnostic coverage incomplete');
 });
 check();report.status='DIAGNOSTIC COMPLETED: never a qualification PASS';
}catch(error){abortReads(String(error));report.status='DIAGNOSTIC FAILED: no retry; remaining seams NOT RUN';report.firstFailure??=String(error);process.exitCode=1;}
finally{
 clearInterval(monitor);wall?.stop();report.sampleWallEnded=diagnosticStamp();save();
 const cleanup=createSampleWallGuard(5000,()=>{void server?.kill().catch(()=>{});});
 try{await cleanup.run(async()=>{
  if(sampler?.mayBeActive&&!sampler.stopAttempted){try{report.samplingCleanup=await sampler.cleanupStop(cleanup.remainingMs());}catch(error){report.samplingCleanupFailure=String(error);}}
  if(sampler?.mayBeActive||report.firstFailure||report.guardFailure)await server?.kill();
  if(sampler?.mayBeActive){report.status='DIAGNOSTIC FAILED: sampler stop unconfirmed; owned kill required';process.exitCode=1;}
  const results=await Promise.allSettled([browser?.close(),launchPending?.then(value=>value.close(),()=>{}),vite.close()]);const errors=results.filter(r=>r.status==='rejected');if(errors.length){await server?.kill();throw new Error('Owned close failed: '+errors.map(r=>String(r.reason)).join('; '));}});report.cleanup='Owned browser/server/Vite close completed within5s';}
 catch(error){report.cleanupFailure=String(error);report.status='DIAGNOSTIC FAILED: owned cleanup unconfirmed';process.exitCode=1;}
 finally{cleanup.stop();}
 try{report.systemAfter=pressure();report.swapInBytes=(report.systemAfter.swapins-report.systemBefore.swapins)*report.systemAfter.pageBytes;report.swapOutBytes=(report.systemAfter.swapouts-report.systemBefore.swapouts)*report.systemAfter.pageBytes;}catch(error){report.hostReadoutFailure=String(error);report.status='DIAGNOSTIC FAILED: ambient readout unavailable';process.exitCode=1;}
 save();console.log(JSON.stringify({status:report.status,report:resolve(out,'report.json'),firstFailure:report.firstFailure}));
}
