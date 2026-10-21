import test from 'node:test';import assert from 'node:assert/strict';
import {ownedBrowserMemory,variability,repeatableMeasurements,createSampleWallGuard} from './performance-guards.ts';
test('memory guard includes only the owned browser and all descendant generations',()=>{
 const output='1 0 1000000 50\n99 1 50000 20\n100 1 1000 1\n102 101 3000 3\n101 100 2000 2\n103 99 9000000 90';
 const result=ownedBrowserMemory(output,100);assert.equal(result.aggregateRssBytes,6000*1024);assert.deepEqual(result.processes.map(row=>row.pid).sort(),[100,101,102]);assert.equal(result.rootPresent,true);
});
test('exited owned root cannot adopt unrelated orphan or malformed memory records',()=>{
 assert.deepEqual(ownedBrowserMemory('101 1 2000 2\nnot a process\n9 -1 4 3',100),{rootPresent:false,processes:[],aggregateRssBytes:0});
 assert.throws(()=>ownedBrowserMemory('',0));
});
test('repeatability reports actual variation and refuses missing/nonfinite evidence',()=>{
 assert.equal(variability([100,100,100]).coefficientOfVariation,0);assert.ok(variability([1,1,10]).coefficientOfVariation>1);
 for(const values of [[],[NaN],[-1]])assert.throws(()=>variability(values));
});

test('frozen v1.1 noise floor preserves tiny phases without admitting large unstable phases',()=>{
 assert.equal(repeatableMeasurements([1,4,9]).qualified,true);assert.equal(repeatableMeasurements([100,100,250]).qualified,false);
 assert.equal(repeatableMeasurements([10,10]).qualified,false);
});

test('sample wall expires pending startup and retires its late owned handle',async()=>{
 let resolveStartup:(handle:string)=>void=()=>{},expired=0,retired='';
 const startup=new Promise<string>(resolve=>{resolveStartup=resolve;});
 const guard=createSampleWallGuard(15,()=>{expired++;});
 const operation=guard.run(()=>startup,async handle=>{retired=handle;});
 await assert.rejects(operation,/Sample wall exceeded15ms/);assert.equal(expired,1);
 resolveStartup('owned-browser');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(retired,'owned-browser');assert.throws(()=>guard.remainingMs());guard.stop();
});

test('one wall deadline covers completed startup and the following pending phase',async()=>{
 let expired=0;const guard=createSampleWallGuard(15,()=>{expired++;});
 assert.equal(await guard.run(async()=>42),42);
 await assert.rejects(guard.run(()=>new Promise<never>(()=>{})),/Sample wall exceeded/);
 assert.equal(expired,1);guard.stop();
});

test('successful sample stops its timer and refuses new operations after retirement',async()=>{
 let expired=0;const guard=createSampleWallGuard(15,()=>{expired++;});
 assert.equal(await guard.run(async()=>7),7);guard.stop();
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(expired,0);
 await assert.rejects(guard.run(async()=>8),/Sample wall exceeded/);
});

test('late synchronous settlement cannot outrun the expiry timer and be accepted',async()=>{
 let expired=0,retired=false;const guard=createSampleWallGuard(10,()=>{expired++;});
 await assert.rejects(guard.run(async()=>{const until=performance.now()+20;while(performance.now()<until){/* Deliberately block the timer to test settlement. */}return 'owned';},async()=>{retired=true;}),/Sample wall exceeded/);
 assert.equal(expired,1);assert.equal(retired,true);guard.stop();
});
