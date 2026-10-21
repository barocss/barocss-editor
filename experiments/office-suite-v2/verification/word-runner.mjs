/** Actual Word renderer/layout/print probe. Needs Integration's frozen root graph. */
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus,platform,release,totalmem,freemem,loadavg } from 'node:os';
import { summarize } from './metrics.ts';

const here=dirname(fileURLToPath(import.meta.url));
const sourceRoot=resolve(process.env.M0_WORD_ROOT??'/Users/user/.codex/worktrees/522-m0-integration/barocss-editor');
const requireRoot=createRequire(resolve(sourceRoot,'package.json'));
const { createServer }=await import(resolve(dirname(requireRoot.resolve('vite/package.json')),'dist/node/index.js'));
const { chromium }=requireRoot('playwright');
const expected='9b390602d90e07f496b7b699915b7d605582d8a4';
const git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
const files=['apps/word/src/runtime.ts','packages/office-word/src/word-layout-pass.ts','packages/office-word/src/measurement.ts','packages/office-word/src/pagination.ts','packages/office-word/src/print-pages.ts','packages/office-word/src/word-docx.ts','packages/office-word/src/word-docx-import.ts','packages/office-word/src/ui.css','packages/office-text/src/text.css'];
// Later integration HEADs may advance, but the exact measured production sources must match S.
for(const path of files) {
  const original=execFileSync('git',['show',`${expected}:${path}`],{cwd:sourceRoot});
  if(!original.equals(readFileSync(resolve(sourceRoot,path)))) throw new Error(`Word source drift: ${path}`);
}
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const directory=resolve(here,'reports');mkdirSync(directory,{recursive:true});
const reportName=process.env.M0_SMOKE==='1'?'word-smoke.json':'word-baseline.json';
const report={schema:'office-v2-m0/word-baseline-v1',capturedUtc:new Date().toISOString(),source:{baseline:expected,head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),files:files.map(path=>({path,sha256:sha(resolve(sourceRoot,path))}))},
 harness:{files:['word-runner.mjs','word-browser.mjs','profiles.ts','metrics.ts','word.html'].map(path=>({path,sha256:sha(resolve(here,path))}))},
 environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,platform:platform(),release:release(),totalMemoryBytes:totalmem(),freeMemoryBytes:freemem(),loadAverage:loadavg(),quietWindow:process.env.M0_QUIET_WINDOW??'NOT CONFIRMED; ambient author/integration work may contend',viewport:{width:1280,height:900},deviceScaleFactor:1,fontPolicy:'OS fonts, no external requests; CDP actual fonts recorded'},
 workload:{pages:[100,300],paragraphsPerPage:8,explicitBreaks:true,content:'Korean and Latin synthetic prose; explicit break before each group of8 paragraphs',samples:Number(process.env.M0_SAMPLES??3)},samples:[],errors:[],limits:['Controlled standalone Word runtime, no Office account/DB/saved-state flow.','Print measures actual createPrintPages.build DOM construction, not OS spool/PDF fidelity.','No keystroke-to-paint, scroll or physical IME claim.','No font files included; exact loaded platform fonts recorded below.'],status:'NOT RUN'};
if(!Number.isSafeInteger(report.workload.samples)||report.workload.samples<1||report.workload.samples>20)throw new Error('M0_SAMPLES must be1..20');
const quiet=process.env.M0_QUIET_RECEIPT?JSON.parse(readFileSync(process.env.M0_QUIET_RECEIPT,'utf8')):null;
report.quietLease=quiet;
const deadline=quiet?Date.parse(quiet.deadline_utc):Date.now()+240000;
if(deadline<=Date.now())throw new Error('Measurement lease expired before start');
const alias={
 '@m0-word-runtime':resolve(sourceRoot,'apps/word/src/runtime.ts'),
 '@m0-docx-import':resolve(sourceRoot,'packages/office-word/src/word-docx-import.ts'),
 '@m0-docx-export':resolve(sourceRoot,'packages/office-word/src/word-docx.ts'),
 '@m0-word-css':resolve(sourceRoot,'packages/office-word/src/ui.css'),
 '@m0-text-css':resolve(sourceRoot,'packages/office-text/src/text.css')};
const server=await createServer({configFile:false,root:here,cacheDir:resolve(here,'.cache/vite'),resolve:{alias},server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,sourceRoot]}},logLevel:'warn'});
let browser;
const watchdog=setTimeout(()=>{report.errors.push('Owned browser deadline reached');void browser?.close();},Math.min(240000,deadline-Date.now()));
try {
 await server.listen();browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info']});report.environment.browser=browser.version();
 for(const pages of (process.env.M0_SMOKE==='1'?[1]:process.env.M0_PAGE?[Number(process.env.M0_PAGE)]:[100,300])) for(let sample=0;sample<report.workload.samples;sample++) {
  if(Date.now()>=deadline)throw new Error('Measurement lease expired before next sample');
  const context=await browser.newContext({viewport:report.environment.viewport,deviceScaleFactor:1});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>report.errors.push(String(error)));
  try {
   const navigationStart=performance.now();await page.goto('http://127.0.0.1:55260/word.html');await page.waitForFunction(()=>!!window.m0Word);
   const moduleLoadMs=performance.now()-navigationStart;const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('DOM.enable');await cdp.send('CSS.enable');
   const memoryBefore=await cdp.send('Performance.getMetrics');
   const open=await page.evaluate(pages=>window.m0Word.open(pages),pages);
   const cdpDocument=await cdp.send('DOM.getDocument');const paragraph=await cdp.send('DOM.querySelector',{nodeId:cdpDocument.root.nodeId,selector:'.w-paragraph'});
   const fonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:paragraph.nodeId});
   const renderMs=await page.evaluate(()=>window.m0Word.render());
   const print=await page.evaluate(()=>window.m0Word.print());const memoryAfterPrint=await cdp.send('Performance.getMetrics');
   const metricObject=r=>Object.fromEntries(r.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','LayoutCount','LayoutDuration'].includes(m.name)).map(m=>[m.name,m.value]));
   const row={pages,sample,moduleLoadMs,open,renderMs,print,memoryBefore:metricObject(memoryBefore),memoryAfterPrint:metricObject(memoryAfterPrint),fonts:fonts.fonts,loadAverage:loadavg()};report.samples.push(row);
   await page.evaluate(()=>window.m0Word.clearPrint());
   if(open.pages!==pages||print.pages!==pages) throw new Error(`Page count mismatch expected${pages}, open${open.pages}, print${print.pages}`);
   console.log(JSON.stringify({pages,sample,openMs:open.elapsedMs,renderMs,printMs:print.elapsedMs,printedElements:print.printedElements}));
  } catch(error) {report.failureState=await page.evaluate(()=>({sheets:document.querySelectorAll('.w-sheet').length,paragraphs:document.querySelectorAll('.w-paragraph').length,rootElements:document.querySelector('.w-document')?.querySelectorAll('*').length,layout:window.wordLayout?[...window.wordLayout].map(([id,l])=>({id,pages:l.pages.length,totalHeight:l.totalHeight})):null,bodyText:document.body.innerText.slice(0,500)})).catch(e=>({snapshotError:String(e)}));throw error;} finally {await context.close();writeFileSync(resolve(directory,reportName),JSON.stringify(report,null,2)+'\n');}
 }
 report.status=report.errors.length?'FAIL':'PASS';
 report.summaries=[...new Set(report.samples.map(s=>s.pages))].map(pages=>{const rows=report.samples.filter(s=>s.pages===pages);return {pages,openMs:summarize(rows.map(s=>s.open.elapsedMs)),renderMs:summarize(rows.map(s=>s.renderMs)),printMs:summarize(rows.map(s=>s.print.elapsedMs)),heapAfterPrintBytes:summarize(rows.map(s=>s.memoryAfterPrint.JSHeapUsedSize))};});
 // Independent native codec execution on the actual synthetic fixture, separate from page measurement.
 const context=await browser.newContext();const page=await context.newPage();await page.goto('http://127.0.0.1:55260/word.html');await page.waitForFunction(()=>!!window.m0Word);
 const input=readFileSync(resolve(here,'corpus/word-features.docx'));
 const result=await page.evaluate(bytes=>window.m0Word.docx(bytes),Array.from(input));
 writeFileSync(resolve(directory,'word-current-export.docx'),new Uint8Array(result.exportBytes));delete result.exportBytes;
 report.docx={inputSha256:sha(resolve(here,'corpus/word-features.docx')),outputSha256:sha(resolve(directory,'word-current-export.docx')),status:'EXECUTED; inspect warnings and semantic losses',...result};await context.close();
} catch(error){report.status='FAIL';report.firstFailure=report.errors[0]??String(error);console.error(error);process.exitCode=1;}
finally{clearTimeout(watchdog);await browser?.close();await server.close();writeFileSync(resolve(directory,reportName),JSON.stringify(report,null,2)+'\n');}
