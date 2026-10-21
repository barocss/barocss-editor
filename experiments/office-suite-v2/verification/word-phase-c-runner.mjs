import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadavg} from 'node:os';
import {environment,sourceBinding} from './metrics.ts';
const here=dirname(fileURLToPath(import.meta.url));
const lease=JSON.parse(readFileSync('/Users/user/barocss-editor/.omx/m0/phase-c-verification-lease.json','utf8'));
if(lease.status!=='granted'||lease.port!==55260||Date.parse(lease.deadline_utc)<=Date.now())throw new Error('Current diagnostic lease required');
const root=lease.source_root,requireRoot=createRequire(resolve(root,'package.json'));
const {createServer}=await import(resolve(dirname(requireRoot.resolve('vite/package.json')),'dist/node/index.js'));const {chromium}=requireRoot('playwright');
const paths=['apps/word/src/runtime.ts','packages/office-word/src/word-layout-pass.ts','packages/office-word/src/renderers/page.ts','packages/editor-view-dom/src/editor-view-dom.ts','packages/renderer-dom/src/dom-renderer.ts','packages/renderer-dom/src/reconcile/fiber/fiber-scheduler.ts'];
for(const path of paths){const expected=execFileSync('git',['show',`${lease.source_head}:${path}`],{cwd:root});if(!expected.equals(readFileSync(resolve(root,path))))throw new Error(`Source changed without new pin: ${path}`);}
const sha=p=>createHash('sha256').update(readFileSync(resolve(here,p))).digest('hex');
const report={schema:'office-v2-m0/word-phase-c-diagnostic-v1',lease,environment:environment(),loadAtStart:loadavg(),source:sourceBinding(root,paths),harness:['word-phase-c-runner.mjs','word-phase-c-browser.mjs','profiles.ts','font-metadata.py'].map(path=>({path,sha256:sha(path)})),console:[],pageErrors:[],status:'NOT RUN'};
const server=await createServer({configFile:false,root:here,cacheDir:resolve(here,'.cache/vite'),optimizeDeps:{entries:['word-phase-c.html']},resolve:{alias:{'@m0-word-runtime':resolve(root,'apps/word/src/runtime.ts'),'@m0-editor-view':resolve(root,'packages/editor-view-dom/src/index.ts'),'@m0-word-css':resolve(root,'packages/office-word/src/ui.css'),'@m0-text-css':resolve(root,'packages/office-text/src/text.css')}},server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,root]}},logLevel:'warn'});
let browser;const timer=setTimeout(()=>{report.timeout='30s diagnostic wall bound';void browser?.close();},30000);
try{await server.listen();browser=await chromium.launch({headless:true,executablePath:lease.browser_executable});report.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>report.pageErrors.push({error:String(e),stack:e.stack}));
 await page.goto('http://127.0.0.1:55260/word-phase-c.html');await page.waitForFunction(()=>!!window.m0Diagnostic);report.observation=await page.evaluate(()=>window.m0Diagnostic({pages:100,afterCommitRender:true}));
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const target=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-m0-font-target="true"]'});
 report.actualFonts=target.nodeId?(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:target.nodeId})).fonts:[];
 report.installedFontIdentity=JSON.parse(execFileSync('python3',[resolve(here,'font-metadata.py'),JSON.stringify([...new Set(report.actualFonts.map(font=>font.postScriptName))])],{encoding:'utf8',timeout:5000}));
 await page.evaluate(()=>window.m0DiagnosticDispose());report.status='EXECUTED: source-path diagnostic';
}catch(error){report.status='FAIL';report.firstFailure=String(error);process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();await server.close();report.loadAtEnd=loadavg();writeFileSync(resolve(here,'reports/word-phase-c-diagnostic.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,normal:report.observation?.normal,afterControlledRender:report.observation?.afterControlledRender,firstFailure:report.firstFailure}));}
