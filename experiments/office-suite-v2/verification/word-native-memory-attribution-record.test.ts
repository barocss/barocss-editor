import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {ownedBrowserMemory} from './performance-guards.ts';
import {NativeMemoryRecorder,isMissingNativeMethod,runtimeHeapSeries} from './word-native-memory-attribution-record.ts';
const profile={profile:{samples:[{size:131072,total:262144,stack:['0x1234','unresolved']}],modules:[{name:'module',uuid:'id',baseAddress:'0x123456789abcdef',size:1024}]}};
const missing=()=>Object.assign(new Error('structured protocol failure'),{code:-32601});
const make=(send:(method:string)=>Promise<unknown>,extra:Partial<ConstructorParameters<typeof NativeMemoryRecorder>[0]>={})=>new NativeMemoryRecorder({send,remainingMs:()=>1000,observe:()=>{},...extra});
test('actual sampler orders start, operation, pairedreadout, get, stop and stores addresses unchanged',async()=>{
 const calls:string[]=[];const r=make(async method=>{calls.push(method);return method==='Memory.getSamplingProfile'?profile:{};});
 await r.window('cold',async()=>{calls.push('actual');return 8;},async value=>{assert.equal(value,8);calls.push('paired');});
 assert.deepEqual(calls,['Memory.startSampling','actual','paired','Memory.getSamplingProfile','Memory.stopSampling']);assert.deepEqual(r.windows[0]?.response,profile);assert.equal(r.mayBeActive,false);assert.equal(r.windows[0]?.status,'COMPLETED diagnostic window');
});
test('unsupported classification requires structured code; missing start skips future samplers without bogus stop',async()=>{
 assert.equal(isMissingNativeMethod(new Error("Memory.startSampling wasn't found")),false);assert.equal(isMissingNativeMethod({code:-32602}),false);
 const calls:string[]=[];let actual=0;const r=make(async method=>{calls.push(method);throw missing();});
 for(const name of ['cold','warm','print'] as const)await r.window(name,async()=>++actual,async()=>{});
 assert.deepEqual(calls,['Memory.startSampling']);assert.equal(actual,3);assert.equal(r.mayBeActive,false);assert.equal(r.windows.length,3);
});
test('missing get still stops current sampler and skips later starts; unrelated errors fail',async()=>{
 const calls:string[]=[];const r=make(async method=>{calls.push(method);if(method==='Memory.getSamplingProfile')throw missing();return {};});
 await r.window('cold',async()=>1,async()=>{});await r.window('warm',async()=>2,async()=>{});
 assert.deepEqual(calls,['Memory.startSampling','Memory.getSamplingProfile','Memory.stopSampling']);assert.equal(r.windows[0]?.profileStatus,'UNAVAILABLE; future starts skipped');
 const bad=make(async()=>{throw new Error('invalid parameters');});await assert.rejects(bad.window('cold',async()=>1,async()=>{}),/invalid parameters/);assert.equal(bad.failed,true);
});
test('malformed withinlimit response is preserved before validation and stop; retry is refused',async()=>{
 const response={profile:{samples:'bad',modules:[]}},calls:string[]=[];const r=make(async method=>{calls.push(method);return method==='Memory.getSamplingProfile'?response:{};});
 await assert.rejects(r.window('cold',async()=>1,async()=>{}),/Invalid native profile arrays/);assert.deepEqual(r.windows[0]?.response,response);assert.equal(calls.at(-1),'Memory.stopSampling');await assert.rejects(r.window('warm',async()=>1,async()=>{}),/Prior native window failed/);
});
test('postreceipt individual and cumulative caps retain size/hash but omit oversized bodies and always stop',async()=>{
 const bytes=Buffer.byteLength(JSON.stringify(profile));const one=make(async method=>method==='Memory.getSamplingProfile'?profile:{},{profileLimitBytes:bytes-1});
 await assert.rejects(one.window('cold',async()=>1,async()=>{}),/post-receipt storage cap/);assert.equal(one.windows[0]?.response,undefined);assert.equal(one.windows[0]?.receivedJsonBytes,bytes);assert.match(String(one.windows[0]?.receivedJsonSha256),/^[a-f0-9]{64}$/);assert.equal(one.mayBeActive,false);
 const total=make(async method=>method==='Memory.getSamplingProfile'?profile:{},{totalLimitBytes:bytes});await total.window('cold',async()=>1,async()=>{});await assert.rejects(total.window('warm',async()=>1,async()=>{}),/storage cap/);assert.equal(total.retainedProfileBytes,bytes);assert.equal(total.windows[1]?.response,undefined);assert.equal(total.mayBeActive,false);
});
test('command timeout and late settlement fail; uncertain start receives one stop, failed stop is never retried',async()=>{
 const calls:string[]=[];const timed=make(async method=>{calls.push(method);if(method==='Memory.startSampling')return new Promise(()=>{});return {};},{commandTimeoutMs:5});
 await assert.rejects(timed.window('cold',async()=>1,async()=>{}),/command timeout/);assert.deepEqual(calls,['Memory.startSampling','Memory.stopSampling']);assert.equal(timed.commands[0]?.status,'FAILED');assert.ok(timed.commands[0]?.started&&timed.commands[0]?.ended);
 let tick=0;const late=make(async()=>{tick=20;return {};},{commandTimeoutMs:10,clock:()=>({utc:'test',monotonicMs:tick})});await assert.rejects(late.command('Runtime.getHeapUsage'),/settled after command deadline/);
 let stops=0;const bad=make(async method=>{if(method==='Memory.stopSampling'){stops++;throw new Error('stop failed');}return method==='Memory.getSamplingProfile'?profile:{};});await assert.rejects(bad.window('cold',async()=>1,async()=>{}),/stop failed/);await bad.cleanupStop(10);assert.equal(stops,1);assert.equal(bad.mayBeActive,true);
});
test('expired samplewall defers sampler stop to independent cleanup budget',async()=>{
 let remaining=1000,stops=0;const r=make(async method=>{if(method==='Memory.stopSampling')stops++;return {};},{remainingMs:()=>remaining});
 await assert.rejects(r.window('cold',async()=>{remaining=0;throw new Error('sample expired');},async()=>{}),/sample expired/);assert.equal(r.stopAttempted,false);assert.equal(r.mayBeActive,true);await r.cleanupStop(50);assert.equal(stops,1);assert.equal(r.mayBeActive,false);
});
test('Runtime fields stay separate, missing values unavailable; verified missing command is not retried',async()=>{
 assert.deepEqual(runtimeHeapSeries({usedSize:0,totalSize:20}).values,{usedSize:0,totalSize:20,embedderHeapUsedSize:null,backingStorageSize:null});assert.equal(runtimeHeapSeries(null).status,'unavailable-or-partial');
 let calls=0;const r=make(async()=>{calls++;throw missing();});assert.equal((await r.heapUsage()).status,'UNAVAILABLE');assert.equal((await r.heapUsage()).status,'UNAVAILABLE');assert.equal(calls,1);
});
test('stop budget loss before actual dispatch remains eligible for one independent cleanup stop',async()=>{
 let reads=0,stops=0;const r=make(async method=>{if(method==='Memory.stopSampling')stops++;return {};},{remainingMs:()=>{reads++;if(reads>=2)throw new Error('lease expires before stop dispatch');return 1000;}});
 await assert.rejects(r.window('cold',async()=>{throw new Error('primary API failure');},async()=>{}),/primary API failure/);
 assert.equal(r.stopAttempted,false);assert.equal(r.mayBeActive,true);await r.cleanupStop(50);assert.equal(stops,1);assert.equal(r.mayBeActive,false);
});
test('supported empty profile remains supported, while malformed acknowledgements failclosed',async()=>{
 const r=make(async method=>method==='Memory.getSamplingProfile'?{profile:{samples:[],modules:[]}}:{});await r.window('cold',async()=>1,async()=>{});assert.equal(r.windows[0]?.profileStatus,'SUPPORTED EMPTY profile; not zero-allocation proof');assert.equal(r.nativeUnavailable,null);
 const bad=make(async method=>method==='Memory.startSampling'?null:{});await assert.rejects(bad.window('cold',async()=>1,async()=>{}),/Invalid native start acknowledgement/);assert.equal(bad.mayBeActive,false);
 const heap=make(async()=>null);await assert.rejects(heap.heapUsage(),/Invalid Runtime heap response schema/);
});

test('actual common RSS read saves the crossing PID table then requests urgent owned kill',()=>{
 const runner=readFileSync(new URL('./word-native-memory-attribution-runner.mjs',import.meta.url),'utf8');const source=runner.slice(runner.indexOf('function rss(){'),runner.indexOf('\nasync function stage('));let saved=false,urgent=false;
 const report:{failedResourceRead?:{availableOwnedMemory:ReturnType<typeof ownedBrowserMemory>}}={};
 const probe:()=>unknown=vm.runInNewContext(source+';rss',{execFileSync:()=> '100 1 2100000 2\n101 100 1000 1',ownedBrowserMemory,rootPid:100,protocol:{guards:{ownedAggregateRssBytes:2147483648}},report,phase:'paired-or-monitor',diagnosticStamp:()=>({utc:'test',monotonicMs:0}),save:()=>{saved=true;},failClosed:(_reason:string,isUrgent:boolean)=>{assert.equal(saved,true);urgent=isUrgent;}});
 assert.throws(probe,/RSS exceeded2GiB/);assert.equal(urgent,true);assert.equal(report.failedResourceRead?.availableOwnedMemory.aggregateRssBytes,2101000*1024);
});
