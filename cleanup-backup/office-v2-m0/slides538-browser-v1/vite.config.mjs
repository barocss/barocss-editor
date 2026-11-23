import {createRequire} from 'node:module';
const root='/Users/user/.codex/worktrees/slides-m0-baseline/barocss-editor';
const frozen='/Users/user/.codex/worktrees/522-m0-integration/barocss-editor';
const output='/Users/user/barocss-editor/.omx/m0/slides538-browser-v1';
const require=createRequire(root+'/package.json');
const {loadConfigFromFile,mergeConfig,searchForWorkspaceRoot}=require('vite');
export default async env=>{
 const loaded=await loadConfigFromFile(env,root+'/apps/slide/vite.config.ts');
 if(!loaded)throw new Error('Actual Slides Vite configuration unavailable');
 return mergeConfig(loaded.config,{root:root+'/apps/slide',cacheDir:output+'/vite-cache',server:{host:'127.0.0.1',port:55261,strictPort:true,fs:{allow:[searchForWorkspaceRoot(root+'/apps/slide'),frozen+'/node_modules',output]}}});
};
