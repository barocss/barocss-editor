import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DisposableDurableStore, PendingUpdates, updateHash } from '../src/durable-store.ts';
import type { Admission, StoreOptions, UpdatePacket } from '../src/durable-store.ts';
import { ProseReplica,validateProseDocument } from '../src/prose.ts';

const admission:Admission={documentId:'verification-doc',generation:'g1',engineId:'prose-v1',contractVersion:1,engineVersion:1,schemaVersion:1,adapterVersion:1};
const actor={actorId:'server-known-user',sessionId:'server-known-session'};
function setup(){let allowed=true;const options:StoreOptions={admission,currentAccess:(authenticated)=>allowed&&authenticated.actorId===actor.actorId&&authenticated.sessionId===actor.sessionId,
 validateDocument:(candidate)=>validateProseDocument(candidate)};
 const store=DisposableDurableStore.create(options);return {store,options,revoke(){allowed=false;},clean(){store.close();rmSync(store.directory,{recursive:true,force:true});}};}
function packet(id:string,replica:ProseReplica):UpdatePacket{return {admission,updateId:id,bytes:replica.exportUpdate()};}

test('ACK-loss receipt survives restart and payload compaction without duplicate text',()=>{
 const p=setup(),replica=new ProseReplica('local-tab');let reopened:DisposableDurableStore|undefined,reader:ProseReplica|undefined;
 try{replica.insert(0,'한글 durable');const first=packet('first',replica),queue=new PendingUpdates();queue.add(first);queue.synchronized('first');assert.equal(queue.state('first'),'synchronized');
 queue.result('first',p.store.append(actor,first,true));assert.equal(queue.state('first'),'acknowledgment-unknown');assert.deepEqual(p.store.includedUpdateIds(),['first']);
 p.store.close();
 const child=`import {DisposableDurableStore} from ${JSON.stringify(new URL('../src/durable-store.ts',import.meta.url).href)};
 import {ProseReplica,validateProseDocument} from ${JSON.stringify(new URL('../src/prose.ts',import.meta.url).href)};
 const store=DisposableDurableStore.reopen(process.argv[1],{admission:${JSON.stringify(admission)},currentAccess:()=>true,validateDocument:doc=>validateProseDocument(doc)});
 const reader=new ProseReplica('new-process',store.exportUpdate());
 console.log(JSON.stringify({text:reader.text,ids:store.includedUpdateIds()}));reader.destroy();store.close();`;
 const restored=JSON.parse(execFileSync(process.execPath,['--input-type=module','--eval',child,p.store.directory],{encoding:'utf8'})) as {text:string;ids:string[]};
 assert.equal(restored.text,'한글 durable');assert.deepEqual(restored.ids,['first']);
 reopened=DisposableDurableStore.reopen(p.store.directory,p.options);const receipt=reopened.append(actor,first);assert.equal(receipt.status,'durable');if(receipt.status!=='durable')throw new Error('Expected receipt');
 assert.equal(receipt.receipt.hash,updateHash(first.bytes));assert.equal(receipt.receipt.sequence,1);queue.result('first',receipt);assert.equal(queue.state('first'),'durable');
 const checkpoint=reopened.checkpoint();assert.deepEqual(checkpoint.includedUpdateIds,['first']);assert.equal(checkpoint.throughSequence,1);
 replica.insert(replica.text.length,' + later');assert.equal(reopened.append(actor,packet('second',replica)).status,'durable');reopened.close();
 reopened=DisposableDurableStore.reopen(p.store.directory,p.options);reader=new ProseReplica('reloaded',reopened.exportUpdate());assert.equal(reader.text,'한글 durable + later');
 assert.equal(reader.undo(),false);assert.deepEqual(reopened.includedUpdateIds(),['first','second']);assert.equal(reopened.append(actor,first).status,'durable');
 }finally{reader?.destroy();replica.destroy();reopened?.close();p.clean();}
});
test('revoked session cannot replay old durable receipt; offline bytes remain pending',()=>{
 const p=setup(),replica=new ProseReplica('offline');try{replica.insert(0,'saved');const first=packet('first',replica);assert.equal(p.store.append(actor,first).status,'durable');
 replica.insert(replica.text.length,' pending');const queued=packet('offline',replica),pending=new PendingUpdates();pending.add(queued);p.revoke();
 assert.deepEqual(p.store.append(actor,first),{status:'rejected',code:'current-access-denied'});const refusal=p.store.append(actor,queued);pending.result('offline',refusal);
 assert.equal(pending.state('offline'),'rejected');assert.deepEqual(pending.pending()[0]?.bytes,queued.bytes);assert.deepEqual(p.store.includedUpdateIds(),['first']);
 }finally{replica.destroy();p.clean();}
});
test('incompatible generation/schema, forged transport session and ID collision cannot mutate persisted state',()=>{
 const p=setup(),replica=new ProseReplica('client');try{replica.insert(0,'base');const first=packet('same-id',replica);assert.equal(p.store.append(actor,first).status,'durable');const stable=p.store.exportUpdate();
 const packets:UpdatePacket[]=[{...first,admission:{...admission,generation:'old'}},{...first,admission:{...admission,schemaVersion:2} as unknown as Admission}];
 for(const item of packets)assert.deepEqual(p.store.append(actor,item),{status:'rejected',code:'incompatible-admission'});
 assert.deepEqual(p.store.append({actorId:'forged',sessionId:'forged'},first),{status:'rejected',code:'current-access-denied'});
 replica.insert(replica.text.length,' changed');assert.deepEqual(p.store.append(actor,packet('same-id',replica)),{status:'rejected',code:'update-id-collision'});
 assert.deepEqual(p.store.exportUpdate(),stable);assert.deepEqual(p.store.includedUpdateIds(),['same-id']);assert.throws(()=>p.store.replaceSnapshot(),/snapshot-replacement-refused/);
 }finally{replica.destroy();p.clean();}
});
test('late ACK for one input cannot mark a newer input saved; mismatched receipt refuses',()=>{
 const p=setup(),replica=new ProseReplica('client');try{replica.insert(0,'one');const first=packet('one',replica),queue=new PendingUpdates();queue.add(first);const receipt=p.store.append(actor,first);assert.equal(receipt.status,'durable');if(receipt.status!=='durable')throw new Error('Expected receipt');
 replica.insert(replica.text.length,'two');const second=packet('two',replica);queue.add(second);queue.result('one',receipt);assert.equal(queue.state('one'),'durable');assert.equal(queue.state('two'),'local-pending');
 assert.throws(()=>queue.result('two',receipt),/receipt-mismatch/);assert.equal(queue.state('two'),'local-pending');
 }finally{replica.destroy();p.clean();}
});
