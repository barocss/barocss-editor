import test from 'node:test';import assert from 'node:assert/strict';
import {ownedBrowserMemory,variability,repeatableMeasurements} from './performance-guards.ts';
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
