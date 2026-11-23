const fs=require('node:fs');
const path=require('node:path');
const original=fs.readFileSync;
const target='/Users/user/.codex/worktrees/522-m0-integration/barocss-editor/packages/office-word/src/line-offsets.ts';
const baseline=original('/Users/user/barocss-editor/.omx/m0/532-parent-line-offsets.ts');
let reads=0;
fs.readFileSync=function(file,options){
 if(typeof file==='string'&&path.resolve(file)===target){reads++;return typeof options==='string'||options?.encoding ? baseline.toString(typeof options==='string'?options:options.encoding):Buffer.from(baseline);}
 return original.apply(this,arguments);
};
process.on('exit',()=>{process.stderr.write('PARENT_OVERLAY_READS='+reads+'\n');if(reads===0)process.exitCode=97;});
