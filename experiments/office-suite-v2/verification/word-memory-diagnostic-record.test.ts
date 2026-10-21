import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {diagnosticRead,type DiagnosticReadRecord} from './word-memory-diagnostic-record.ts';
import {ownedBrowserMemory} from './performance-guards.ts';
test('diagnostic reads preserve separate sequential brackets instead of claiming atomic values',async()=>{
 let tick=10;const clock=()=>({utc:`clock-${tick}`,monotonicMs:tick++});
 const first=await diagnosticRead('page',async()=>({used:25,total:50}),clock);
 const second=await diagnosticRead('rss',()=>100,clock);
 assert.equal(first.started.monotonicMs,10);assert.equal(first.ended.monotonicMs,11);
 assert.equal(second.started.monotonicMs,12);assert.equal(second.collectionSkewMs,1);
 assert.deepEqual(first.value,{used:25,total:50});assert.equal(second.value,100);
});
test('an aborted pending read cannot accept a late reply as completed evidence',async()=>{
 let finish:(value:string)=>void=()=>{};const seen:{record?:DiagnosticReadRecord<string>}={};
 const pending=diagnosticRead('cdp',()=>new Promise<string>(resolve=>{finish=resolve;}),undefined,record=>{seen.record=record;});
 assert.ok(seen.record);seen.record.status='ABORTED';seen.record.error='wall expired';finish('late reply');
 await assert.rejects(pending,/wall expired/);assert.equal(seen.record.status,'FAILED');assert.equal(Object.hasOwn(seen.record,'value'),false);
});
const runner=readFileSync(new URL('./word-memory-diagnostic-runner.mjs',import.meta.url),'utf8');
test('actual diagnostic RSS guard saves crossing PID/byte evidence before throwing',()=>{
 const source=runner.slice(runner.indexOf('function rss(){'),runner.indexOf('\nasync function stage('));assert.ok(source.startsWith('function rss(){'));
 const report:{failedResourceRead?:{availableOwnedMemory:ReturnType<typeof ownedBrowserMemory>}}={};let saves=0;
 const probe:()=>unknown=vm.runInNewContext(source+';rss',{execFileSync:()=> '100 1 2100000 2\n101 100 1000 1',ownedBrowserMemory,rootPid:100,protocol:{guards:{ownedAggregateRssBytes:2147483648}},report,phase:'controlled-test',diagnosticStamp:()=>({utc:'test',monotonicMs:0}),save:()=>{saves++;}});
 assert.throws(probe,/RSS exceeded2GiB/);assert.equal(saves,1);assert.equal(report.failedResourceRead?.availableOwnedMemory.aggregateRssBytes,2101000*1024);assert.equal(report.failedResourceRead?.availableOwnedMemory.processes.length,2);
});
test('actual diagnostic stage rejects a late settlement even before its timer callback',async()=>{
 const source=runner.slice(runner.indexOf('async function stage('),runner.indexOf('\nasync function roles('));
 const report:{operations:Array<{status:string;returnedAfterLimit?:unknown}>;guardFailure?:string}={operations:[]};
 const probe:(name:string,limit:number,operation:()=>Promise<string>)=>Promise<unknown>=vm.runInNewContext('let phase;'+source+';stage',{check:()=>{},report,diagnosticStamp:()=>({utc:'test',monotonicMs:0}),save:()=>{},setTimeout,clearTimeout,performance:{now:()=>11},bounded:(operation:()=>Promise<string>)=>operation(),failClosed:(reason:string)=>{report.guardFailure=reason;}});
 await assert.rejects(probe('cold',10,async()=> 'late numeric result'),/settled after10ms/);assert.equal(report.operations[0]?.status,'FAILED');assert.equal(report.operations[0]?.returnedAfterLimit,'late numeric result');
});
test('an error after nominal completion still marks the diagnostic failed during cleanup',()=>{
 const source=runner.slice(runner.indexOf('const failClosed='),runner.indexOf('\nconst check='));
 const report:{status:string;firstFailure?:string}={status:'DIAGNOSTIC COMPLETED'};const childProcess={exitCode:0};let rejected='';
 const probe:(reason:string)=>void=vm.runInNewContext(source+';failClosed',{report,process:childProcess,abortReads:()=>{},save:()=>{},rejectFailure:(error:Error)=>{rejected=error.message;},server:{kill:async()=>{}}});
 probe('late cleanup console error');assert.match(report.status,/DIAGNOSTIC FAILED/);assert.equal(childProcess.exitCode,1);assert.equal(rejected,'late cleanup console error');assert.equal(report.firstFailure,'late cleanup console error');
});
test('failed or invalid-clock reads cannot manufacture zero memory observations',async()=>{
 const states:string[]=[];const observations:object[]=[];
 await assert.rejects(diagnosticRead('rss',()=>{throw new Error('ps unavailable');},undefined,record=>{states.push(record.status);observations.push({...record});}),/ps unavailable/);
 assert.deepEqual(states,['RUNNING','FAILED']);assert.equal(Object.hasOwn(observations[1]??{},'value'),false);
 let tick=3;await assert.rejects(diagnosticRead('page',()=>25,()=>({utc:'test',monotonicMs:tick--})),/Invalid diagnostic clock/);
});
