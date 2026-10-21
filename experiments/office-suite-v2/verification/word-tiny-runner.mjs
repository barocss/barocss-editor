import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {environment,sourceBinding} from './metrics.ts';
const here=dirname(fileURLToPath(import.meta.url)),root=process.env.M0_WORD_ROOT??'/Users/user/.codex/worktrees/522-m0-integration/barocss-editor',requireRoot=createRequire(resolve(root,'package.json'));
const {createServer}=await import(resolve(dirname(requireRoot.resolve('vite/package.json')),'dist/node/index.js'));const {chromium}=requireRoot('playwright');
const report={schema:'office-v2-m0/word-tiny-diagnostic-v1',environment:environment(),source:sourceBinding(root,['apps/word/src/runtime.ts','packages/office-word/src/word-layout-pass.ts','packages/office-word/src/renderers/word.ts']),consoleErrors:[],pageErrors:[],status:'NOT RUN'};
const server=await createServer({configFile:false,root:here,cacheDir:resolve(here,'.cache/vite'),resolve:{alias:{'@m0-word-runtime':resolve(root,'apps/word/src/runtime.ts'),'@m0-word-css':resolve(root,'packages/office-word/src/ui.css'),'@m0-text-css':resolve(root,'packages/office-text/src/text.css')}},server:{host:'127.0.0.1',port:55260,strictPort:true,fs:{allow:[here,root]}},logLevel:'warn'});
let browser;
try{await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(25000);
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('pageerror',e=>report.pageErrors.push(String(e)));
 await page.goto('http://127.0.0.1:55260/word-tiny.html');await page.waitForFunction(()=>!!window.m0Tiny);report.observation=await page.evaluate(()=>window.m0Tiny());report.status='EXECUTED: diagnostic only';
}catch(error){report.status='FAIL';report.firstFailure=String(error);process.exitCode=1;}
finally{await browser?.close();await server.close();writeFileSync(resolve(here,'reports/word-tiny-diagnostic.json'),JSON.stringify(report,null,2)+'\n');}
