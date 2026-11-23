import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const out=dirname(fileURLToPath(import.meta.url));
const pin=JSON.parse(readFileSync(out+'/pin.json'));
const root=pin.root,head=pin.head,here=root+'/experiments/office-suite-v2/verification';
const require=createRequire(root+'/package.json');
const {createServer}=require('vite'),{chromium}=require('playwright');
const {ownedBrowserMemory}=await import(here+'/performance-guards.ts');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
assert.equal(process.version,'v22.22.0');assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('status','--porcelain'),'');
const before=JSON.parse(readFileSync(pin.binding));for(const row of before.files)assert.equal(sha(readFileSync(root+'/'+row.path)),row.sha256,row.path);
assert(!readFileSync(out+'/started.json',{flag:'a+'}).length,'One attempt only');
const report={schema:'m0/word100-native-buckets-v1',root,head,tree:git('rev-parse','HEAD^{tree}'),startedUTC:new Date().toISOString(),qualification:false,status:'PREPARING',question:'After justified copy and import-boundary fixes, what native allocator buckets explain renderer RSS, and do current source census/module closure show intended changes?',limits:['Tracing memory dump deterministic=false; no forced GC or heap snapshot.','Dump and read-only census perturb execution; no H7 performance acceptance.','Native allocator dump totals may overlap and need ownership attribution; RSS includes shared pages.'],phases:[],rssSamples:[],modules:[],consoleErrors:[],pageErrors:[]};
writeFileSync(out+'/started.json',JSON.stringify({atUTC:report.startedUTC,pid:process.pid}));
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
let vite,browserServer,browser,browserCDP,page,cdp,monitor,phase='start',tracing=false;const pending=[];
async function capture(name,dump=false){phase=name;const row={name,atUTC:new Date().toISOString(),heap:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters'),processes:(await browserCDP.send('SystemInfo.getProcessInfo')).processInfo};
 row.memory=ownedBrowserMemory(execFileSync('ps',['-axo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:1500}),report.browserRootPID);
 if(dump){row.nativeDump=await browserCDP.send('Tracing.requestMemoryDump',{deterministic:false,levelOfDetail:'detailed'});assert(row.nativeDump.success,'Actual detailed native dump failed');}
 if(['cold-stable','warm-stable'].includes(name))row.census=await page.evaluate(()=>{const root=window.editorView?._domRenderer?.reconciler?.rootFiber;if(!root)throw new Error('No pinned rootFiber');const fs=new Set(),vs=new Set();let maxDepth=0,alternates=0;const vn=v=>{if(!v||typeof v!=='object'||!('tag'in v)||vs.has(v))return;vs.add(v);for(const c of v.children??[])vn(c);};const f=(v,d)=>{if(!v||fs.has(v))return;fs.add(v);maxDepth=Math.max(maxDepth,d);if(v.alternate)alternates++;vn(v.vnode);f(v.child,d+1);f(v.sibling,d);};f(root,0);return {fibers:fs.size,distinctTaggedVNodes:vs.size,maxDepth,alternates};});
 report.phases.push(row);save();console.log(JSON.stringify({phase:name,heap:row.heap,rss:row.memory.aggregateRssBytes,census:row.census,dump:row.nativeDump}));
}
async function finishTrace(){const done=new Promise(resolve=>browserCDP.once('Tracing.tracingComplete',resolve));await browserCDP.send('Tracing.end');const result=await done;tracing=false;assert(result.stream,'Actual native trace stream required');let chunks=[];for(;;){const part=await browserCDP.send('IO.read',{handle:result.stream,size:1024*1024});chunks.push(part.base64Encoded?Buffer.from(part.data,'base64'):Buffer.from(part.data));if(part.eof)break;}await browserCDP.send('IO.close',{handle:result.stream});const data=Buffer.concat(chunks);writeFileSync(out+'/native-trace.json',data);report.trace={bytes:data.length,sha256:sha(data),dataLossOccurred:result.dataLossOccurred??null};}
const watchdog=setTimeout(()=>{report.deadlineFailure='90s limit';void browserServer?.kill();},90000);
try{
 vite=await createServer({configFile:false,root:here,cacheDir:out+'/vite-cache',optimizeDeps:{entries:['word-performance.html']},resolve:{alias:{'@m0-word-runtime':root+'/apps/word/src/runtime.ts','@m0-word-css':root+'/packages/office-word/src/ui.css','@m0-text-css':root+'/packages/office-text/src/text.css'}},server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,root]}},logLevel:'warn'});await vite.listen();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',executablePath:pin.browserExecutable,args:['--enable-precise-memory-info']});report.browserRootPID=browserServer.process().pid;
 monitor=setInterval(()=>{try{const m=ownedBrowserMemory(execFileSync('ps',['-axo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:1500}),report.browserRootPID);report.rssSamples.push({atUTC:new Date().toISOString(),phase,...m});if(m.aggregateRssBytes>2*1024**3){report.resourceFailure='2GiB RSS limit';void browserServer.kill();}}catch(e){report.monitorFailure=String(e);void browserServer.kill();}},200);
 browser=await chromium.connect(browserServer.wsEndpoint());report.browserVersion=browser.version();browserCDP=await browser.newBrowserCDPSession();
 await browserCDP.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordContinuously',includedCategories:['disabled-by-default-memory-infra'],memoryDumpConfig:{triggers:[]}}});tracing=true;
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('pageerror',e=>report.pageErrors.push(String(e)));
 page.on('response',response=>{if(/\.(?:[cm]?[jt]sx?)(?:\?|$)/.test(response.url()))pending.push((async()=>{try{const data=await response.body();report.modules.push({url:response.url(),status:response.status(),bytes:data.length,sha256:sha(data)});}catch(e){report.modules.push({url:response.url(),error:String(e)});}})());});
 await page.goto('http://127.0.0.1:55260/word-performance.html');await page.waitForFunction(()=>!!window.m0WordPerformance);cdp=await context.newCDPSession(page);await capture('navigation',true);
 phase='cold-open';report.open=await page.evaluate(()=>window.m0WordPerformance.open(100));assert.equal(report.open.pages,100);assert.equal(report.open.paragraphs,800);assert.equal(report.open.rootId,report.open.domRoot);assert.equal(report.open.documentFaults.length,0);await capture('cold-stable',true);
 phase='warm-render';report.render=await page.evaluate(()=>window.m0WordPerformance.render(100));await capture('warm-stable');
 phase='print';report.print=await page.evaluate(()=>window.m0WordPerformance.print());assert.equal(report.print.pages,100);await capture('print-built',true);
 await page.evaluate(()=>{window.m0WordPerformance.clearPrint();window.m0WordPerformance.dispose();});await capture('disposed');
 await finishTrace();await Promise.allSettled(pending);
 assert.equal(report.consoleErrors.length,0);assert.equal(report.pageErrors.length,0);assert(!report.resourceFailure&&!report.monitorFailure&&!report.deadlineFailure);
 for(const row of before.files)assert.equal(sha(readFileSync(root+'/'+row.path)),row.sha256,row.path);assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('diff','--name-only','HEAD'),'');report.bindingsAfterEqualBefore=true;report.status='COMPLETED native bucket diagnostic; not qualification';
}catch(e){report.status='FAIL first attempt preserved';report.failure={message:String(e),stack:e.stack};process.exitCode=1;}
finally{clearInterval(monitor);clearTimeout(watchdog);if(tracing){try{await finishTrace();}catch(e){report.traceCleanupFailure=String(e);}}try{await browser?.close();await browserServer?.close();report.browserClosed=true;}catch(e){report.browserCleanupFailure=String(e);await browserServer?.kill().catch(()=>{});}try{await vite?.close();report.viteClosed=true;}catch(e){report.viteCleanupFailure=String(e);}report.completedUTC=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,out,failure:report.failure}));}
