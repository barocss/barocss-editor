import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const out=dirname(fileURLToPath(import.meta.url));
const root='/Users/user/.codex/worktrees/522-m0-portal-joint/barocss-editor';
const head='cd384423c4fd3503a95031f7f0fc229f7d68743f';
const here=root+'/experiments/office-suite-v2/verification';
const require=createRequire(root+'/package.json');
const {createServer}=require('vite'),{chromium}=require('playwright');
const {ownedBrowserMemory}=await import(here+'/performance-guards.ts');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const baseline=JSON.parse(readFileSync('/Users/user/barocss-editor/.omx/m0/word-runtime-bindings-after-performance-qualified.json'));
const report={schema:'m0/word100-question-driven-diagnostic-v1',question:'Which owned process and JS allocation stacks grow at fixture/admission/cold/warm/print, and how many distinct retained Fiber VNodes exist?',head,root,startedUTC:new Date().toISOString(),status:'PREPARING',qualification:false,limits:['Diagnostic adds CDP sampling, phase pauses and read-only census; timings/RSS are not H7 acceptance.','32KiB statistical JS allocation sampling includes collected objects, not exact allocation bytes or native attribution.','No forced GC, heap snapshot, production mutation or user-tab access.'],phases:[],rssSamples:[],consoleErrors:[],pageErrors:[]};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
function bindings(){assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('diff','--name-only'),'');return baseline.files.map(f=>{const b=readFileSync(root+'/'+f.path);assert.equal(sha(b),f.sha256,f.path);return {path:f.path,sha256:sha(b),bytes:b.length};});}
report.sourceBefore=bindings();
assert.equal(process.version,'v22.22.0');
assert(!readFileSync(out+'/started.json',{flag:'a+'}).length,'This diagnostic is one attempt only');
writeFileSync(out+'/started.json',JSON.stringify({startedUTC:report.startedUTC,pid:process.pid}));
let source=readFileSync(here+'/word-performance-browser.mjs','utf8');
source=source.replace("from './profiles.ts'","from '/@fs"+here+"/profiles.ts'");
for(const [old,next] of [
 ['const started=performance.now();assertWordNativeDocument(fixture);const admissionMs=performance.now()-started;',"await window.m0DiagnosticPhase('fixture-built');const started=performance.now();assertWordNativeDocument(fixture);const admissionMs=performance.now()-started;await window.m0DiagnosticPhase('admission-complete');"],
 ['await document.fonts.ready;const result=await stable(pages);',"await window.m0DiagnosticPhase('mount-returned');await document.fonts.ready;const result=await stable(pages);await window.m0DiagnosticPhase('cold-stable');"]
]){assert(source.includes(old),old);source=source.replace(old,next);}
report.privateBrowserModuleSHA256=sha(source);writeFileSync(out+'/browser.mjs',source);
report.moduleResponses=[];const pendingResponses=[];let vite,browserServer,browser,monitor,phase='browser-start',browserCDP,cdp,page;
async function capture(name){phase=name;const row={name,atUTC:new Date().toISOString()};
 row.heap=await cdp.send('Runtime.getHeapUsage');row.dom=await cdp.send('Memory.getDOMCounters');
 row.metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 row.processes=(await browserCDP.send('SystemInfo.getProcessInfo')).processInfo;
 row.memory=ownedBrowserMemory(execFileSync('ps',['-axo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:1500}),browserServer.process().pid);
 const profile=(await cdp.send('HeapProfiler.getSamplingProfile')).profile;
 const file='allocations-'+name+'.json';writeFileSync(out+'/'+file,JSON.stringify(profile));row.profile={file,sha256:sha(readFileSync(out+'/'+file)),bytes:readFileSync(out+'/'+file).length};
 if(['cold-stable','warm-stable'].includes(name))row.census=await page.evaluate(()=>{
  const root=window.editorView?._domRenderer?.reconciler?.rootFiber;if(!root)throw new Error('Pinned rootFiber unavailable');
  const fibers=new Set(),vnodes=new Set();let references=0,maxDepth=0,alternateLinks=0;
  const visitVNode=v=>{if(!v||typeof v!=='object'||!('tag' in v))return;references++;if(vnodes.has(v))return;vnodes.add(v);for(const child of v.children??[])visitVNode(child);};
  const visitFiber=(f,depth)=>{if(!f||fibers.has(f))return;fibers.add(f);maxDepth=Math.max(maxDepth,depth);if(f.alternate)alternateLinks++;visitVNode(f.vnode);visitFiber(f.child,depth+1);visitFiber(f.sibling,depth);};visitFiber(root,0);
  return {fibers:fibers.size,distinctTaggedVNodes:vnodes.size,vnodeReferences:references,maxDepth,alternateLinks,rootVNodeTag:root.vnode?.tag};
 });
 report.phases.push(row);save();console.log(JSON.stringify({phase:name,heap:row.heap,dom:row.dom,census:row.census,rss:row.memory.aggregateRssBytes}));
}
const watchdog=setTimeout(()=>{report.deadlineFailure='90s diagnostic deadline';void browserServer?.kill();},90000);
try{
 vite=await createServer({configFile:false,root:here,cacheDir:out+'/vite-cache',optimizeDeps:{entries:['word-performance.html']},resolve:{alias:{'@m0-word-runtime':root+'/apps/word/src/runtime.ts','@m0-word-css':root+'/packages/office-word/src/ui.css','@m0-text-css':root+'/packages/office-text/src/text.css'}},plugins:[{name:'private-diagnostic-browser-entry',enforce:'pre',load(id){if(id.split('?')[0]===here+'/word-performance-browser.mjs')return source;}}],server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,root,out]}},logLevel:'warn'});
 await vite.listen();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',executablePath:'/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-precise-memory-info']});
 report.browserRootPID=browserServer.process().pid;
 monitor=setInterval(()=>{try{const m=ownedBrowserMemory(execFileSync('ps',['-axo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:1500}),report.browserRootPID);report.rssSamples.push({atUTC:new Date().toISOString(),phase,...m});if(m.aggregateRssBytes>2*1024**3){report.resourceFailure='2GiB owned RSS limit';void browserServer.kill();}}catch(e){report.monitorFailure=String(e);void browserServer.kill();}},200);
 browser=await chromium.connect(browserServer.wsEndpoint());report.browserVersion=browser.version();
 browserCDP=await browser.newBrowserCDPSession();const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('pageerror',e=>report.pageErrors.push(String(e)));
 page.on('response',response=>{if(/\.(?:[cm]?[jt]sx?)(?:\?|$)/.test(response.url()))pendingResponses.push((async()=>{try{const b=await response.body();report.moduleResponses.push({url:response.url(),status:response.status(),bytes:b.length,sha256:sha(b),phase});}catch(e){report.moduleResponses.push({url:response.url(),failure:String(e)});}})());});await page.exposeFunction('m0DiagnosticPhase',capture);
 await page.goto('http://127.0.0.1:55260/word-performance.html');await page.waitForFunction(()=>!!window.m0WordPerformance);
 cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 await capture('navigation');report.open=await page.evaluate(()=>window.m0WordPerformance.open(100));
 assert.equal(report.open.pages,100);assert.equal(report.open.rootId,report.open.domRoot);assert.equal(report.open.documentFaults.length,0);
 report.fontTargets=await page.evaluate(()=>window.m0WordPerformance.fonts());
 report.render=await page.evaluate(()=>window.m0WordPerformance.render(100));await capture('warm-stable');
 report.print=await page.evaluate(()=>window.m0WordPerformance.print());assert.equal(report.print.pages,100);await capture('print-built');
 await page.evaluate(()=>window.m0WordPerformance.clearPrint());await capture('print-cleared');
 await page.evaluate(()=>window.m0WordPerformance.dispose());await capture('disposed');
 report.finalSampling=(await cdp.send('HeapProfiler.stopSampling')).profile;writeFileSync(out+'/allocations-final.json',JSON.stringify(report.finalSampling));delete report.finalSampling;
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);assert(!report.resourceFailure&&!report.monitorFailure&&!report.deadlineFailure);
 await Promise.allSettled(pendingResponses);report.sourceAfter=bindings();assert.deepEqual(report.sourceBefore,report.sourceAfter);report.status='COMPLETED diagnostic; not qualification';
}catch(e){report.status='FAIL first attempt preserved';report.failure={message:String(e),stack:e.stack};process.exitCode=1;}
finally{clearInterval(monitor);clearTimeout(watchdog);try{await browser?.close();await browserServer?.close();report.browserClosed=true;}catch(e){report.cleanupFailure=String(e);await browserServer?.kill().catch(()=>{});}try{await vite?.close();report.viteClosed=true;}catch(e){report.viteCleanupFailure=String(e);}report.completedUTC=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,out,failure:report.failure}));}
