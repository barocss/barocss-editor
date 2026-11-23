import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root='/Users/user/.codex/worktrees/530-word-print/barocss-editor';
const expected='b6a4a05e34dc119593bd008424b742313f94f0e9';
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==expected)throw new Error('Source HEAD changed');
execFileSync('git',['diff','--quiet','HEAD','--'],{cwd:root});
const require=createRequire(root+'/package.json');
const {defineConfig,devices}=require('@playwright/test');
export default defineConfig({
 testDir:root+'/apps/word/tests',testMatch:'word-print.spec.ts',timeout:30000,globalTimeout:300000,
 workers:1,retries:0,maxFailures:1,forbidOnly:true,
 reporter:[['line'],['json',{outputFile:'/Users/user/barocss-editor/.omx/m0/530-word-print-p1-stage-a-results.json'}]],
 outputDir:'/Users/user/barocss-editor/.omx/m0/530-word-print-p1-stage-a-artifacts',
 use:{...devices['Desktop Chrome'],viewport:{width:1280,height:900},deviceScaleFactor:1,
 baseURL:'http://127.0.0.1:55261',headless:true,
 launchOptions:{executablePath:'/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'},
 screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'/Users/user/.nvm/versions/node/v22.22.0/bin/node '+root+'/apps/word/node_modules/vite/bin/vite.js --config /Users/user/barocss-editor/.omx/m0/530-word-print-vite-frozen.config.mjs --host 127.0.0.1 --port 55261 --strictPort',
 cwd:root+'/apps/word',url:'http://127.0.0.1:55261',reuseExistingServer:false,timeout:60000}
});
