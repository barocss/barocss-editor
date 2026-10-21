import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { SheetReplica,sheetAdmission,sheetUpdateValidator } from '../src/collaboration.ts';
import { DisposableDurableStore,PendingUpdates } from '../src/durable-store.ts';
import { createWorkbookContext } from '../src/workbook.ts';
import { encodeCellKey } from '../src/contracts.ts';
import type { CellKey,WorkbookProjection } from '../src/contracts.ts';
import { parseFormula } from '../src/formula.ts';
import { ReferenceIndex } from '../src/references.ts';
import { CalculationEngine } from '../src/calculation.ts';
const context=createWorkbookContext({documentId:'independent-sheet',workbookId:'real-book',generation:'generation-1'});
const A={actorId:'same-user',sessionId:'tab-A'},B={actorId:'same-user',sessionId:'tab-B'};
const key:CellKey={sheetId:'main',rowId:'r0',columnId:'c0'};
function seed(){const a=new SheetReplica(context,A);for(const sheetId of ['main','other']){
 a.commit({kind:'sheet.insert',sheetId,name:sheetId==='main'?'Main':'Other',afterSheetId:sheetId==='main'?null:'main'},`seed-${sheetId}`);
 for(let r=0;r<2;r++)a.commit({kind:'axis.insert',sheetId,axis:'row',id:`r${r}`,afterId:r?'r0':null},`${sheetId}-r${r}`);
 for(let c=0;c<2;c++)a.commit({kind:'axis.insert',sheetId,axis:'column',id:`c${c}`,afterId:c?'c0':null},`${sheetId}-c${c}`);}
 a.commit({kind:'cell.commit',key:{...key,sheetId:'other'},input:{kind:'literal',value:7}},'seed-seven');return a;}
function sync(a:SheetReplica,b:SheetReplica){const aa=a.exportUpdate(),bb=b.exportUpdate();a.receive(bb);b.receive(aa);assert.deepEqual(a.projection,b.projection);}
function value(p:WorkbookProjection,key:CellKey){const calc=new CalculationEngine(p);calc.recalculate();const r=calc.read(key);assert.equal(r.status,'fresh');if(r.status!=='fresh')throw new Error('Not fresh');return r.value;}

test('real two-replica cell alternatives, same-position rows and Formula output agree',()=>{
 const a=seed(),b=new SheetReplica(context,B,a.exportUpdate());try{
 a.commit({kind:'cell.commit',key,input:{kind:'literal',value:11}},'a-cell');
 b.commit({kind:'cell.commit',key,input:parseFormula('=Other!$A$1',key,new ReferenceIndex(b.projection))},'b-cell');
 a.commit({kind:'axis.insert',sheetId:'main',axis:'row',id:'insert-A',afterId:'r0'},'a-row');
 b.commit({kind:'axis.insert',sheetId:'main',axis:'row',id:'insert-B',afterId:'r0'},'b-row');sync(a,b);
 const cell=a.projection.cells[encodeCellKey(key)]!;assert.equal(cell.alternatives.length,2);assert.equal(cell.alternatives.filter(c=>c.state==='alternative').length,1);
 assert.equal(value(a.projection,key),7);assert.equal(value(b.projection,key),7);
 const rows=a.projection.sheets.find(s=>s.id==='main')!.rows;assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.deepEqual(rows.map(r=>r.id),['r0','insert-A','insert-B','r1']);
 a.undo('a-cell','a-session-undo');sync(a,b);assert.equal(value(a.projection,key),7);
 }finally{a.destroy();b.destroy();}
});
test('delete versus remote cross-sheet formula converges to REF; explicit deletion undo restores reference',()=>{
 const a=seed(),b=new SheetReplica(context,B,a.exportUpdate());const formulaKey={...key,columnId:'c1'};try{
 a.commit({kind:'axis.delete',sheetId:'other',axis:'row',id:'r0'},'a-delete');
 b.commit({kind:'cell.commit',key:formulaKey,input:parseFormula('=Other!A1',formulaKey,new ReferenceIndex(b.projection))},'b-formula');sync(a,b);
 assert.deepEqual(value(a.projection,formulaKey),{kind:'error',code:'#REF!'});assert.deepEqual(value(b.projection,formulaKey),{kind:'error',code:'#REF!'});
 a.undo('a-delete','a-restore');sync(a,b);assert.equal(value(a.projection,formulaKey),7);assert.equal(value(b.projection,formulaKey),7);
 }finally{a.destroy();b.destroy();}
});
test('A row created then B cell commit makes A undo recoverably refuse without lost data',()=>{
 const a=seed(),b=new SheetReplica(context,B,a.exportUpdate());const remote={...key,rowId:'created'};try{
 a.commit({kind:'axis.insert',sheetId:'main',axis:'row',id:'created',afterId:'r0'},'a-created');b.receive(a.exportUpdate());
 b.commit({kind:'cell.commit',key:remote,input:{kind:'literal',value:42}},'b-write');a.receive(b.exportUpdate());
 a.undo('a-created','a-undo');sync(a,b);assert.deepEqual(a.projection.outcomes['a-undo'],{status:'refused',code:'UNDO_CONFLICT',recoverable:true});
 assert.equal(value(a.projection,remote),42);assert.equal(value(b.projection,remote),42);assert.equal(a.projection.cells[encodeCellKey(remote)]?.deleted,false);
 const fresh=new SheetReplica(context,{...A,sessionId:'new-tab'},a.exportUpdate());try{fresh.undo('b-write','foreign-undo');assert.deepEqual(fresh.projection.outcomes['foreign-undo'],{status:'refused',code:'UNDO_SESSION',recoverable:false});}finally{fresh.destroy();}
 }finally{a.destroy();b.destroy();}
});
/** Wire corruption fixture: equal-length UTF-8 replacement, not a Yjs implementation. */
function alteredAdmittedBody(bytes:Uint8Array){const before=new TextEncoder().encode('"name":"Main"'),after=new TextEncoder().encode('"name":"Evil"');const result=new Uint8Array(bytes);let found=-1;
 for(let i=0;i<=bytes.length-before.length;i++)if(before.every((n,j)=>bytes[i+j]===n)){assert.equal(found,-1,'Expected unique fixture marker');found=i;}
 assert.ok(found>=0,'Actual provider update must contain this synthetic canonical event body');result.set(after,found);return result;}
test('actual server refuses forged native identity and admitted-event-body replay tamper; ACK and checkpoint remain bound',()=>{
 const a=seed(),b=new SheetReplica(context,B,a.exportUpdate());let allowed=true;
 const options={admission:sheetAdmission(context),currentAccess:(who:typeof A)=>allowed&&who.actorId===A.actorId&&[A.sessionId,B.sessionId].includes(who.sessionId),validateDocument:sheetUpdateValidator(context)};
 const store=DisposableDurableStore.create(options);let restored:DisposableDurableStore|undefined;try{
 const first={admission:options.admission,updateId:'seed-packet',bytes:a.exportUpdate()},pending=new PendingUpdates();pending.add(first);pending.result(first.updateId,store.append(A,first,true));assert.equal(pending.state(first.updateId),'acknowledgment-unknown');
 const retry=store.append(A,first);pending.result(first.updateId,retry);assert.equal(pending.state(first.updateId),'durable');
 const forged=new SheetReplica(context,{actorId:'forged-actor',sessionId:'forged-session'},a.exportUpdate());try{
 forged.commit({kind:'cell.commit',key,input:{kind:'literal',value:99}},'forged-event');const refusal=store.append(A,{admission:options.admission,updateId:'forged',bytes:forged.exportUpdate()});
 assert.deepEqual(refusal,{status:'rejected',code:'validation:authenticated-event-identity'});
 }finally{forged.destroy();}
 const before=store.exportUpdate();const tampered=alteredAdmittedBody(first.bytes);const refusal=store.append(A,{admission:options.admission,updateId:'alter-old-event',bytes:tampered});
 assert.equal(refusal.status,'rejected');if(refusal.status!=='rejected')throw new Error('Expected native admission refusal');assert.match(refusal.code,/hidden-event-collision|admitted-event-changed/);assert.deepEqual(store.exportUpdate(),before);assert.throws(()=>a.receive(tampered),/hidden-event-collision|admitted-event-changed/);
 b.commit({kind:'cell.commit',key,input:{kind:'literal',value:20}},'b-server-cell');assert.equal(store.append(B,{admission:options.admission,updateId:'remote',bytes:b.exportUpdate()}).status,'durable');store.checkpoint();store.close();
 restored=DisposableDurableStore.reopen(store.directory,options);const recovered=new SheetReplica(context,{...A,sessionId:'restart'},restored.exportUpdate());try{assert.equal(value(recovered.projection,key),20);}finally{recovered.destroy();}
 allowed=false;assert.deepEqual(restored.append(A,first),{status:'rejected',code:'current-access-denied'});assert.deepEqual(restored.includedUpdateIds(),['seed-packet','remote']);
 }finally{restored?.close();store.close();rmSync(store.directory,{recursive:true,force:true});a.destroy();b.destroy();}
});

test('causal frontier keeps sequential context linear and joins three offline branches without losing session undo',()=>{
 const a=seed();let b:SheetReplica|undefined,c:SheetReplica|undefined;try{
 for(let i=0;i<40;i++)a.commit({kind:'cell.commit',key,input:{kind:'literal',value:i}},`seq-${i}`);
 const sequential=a.events.filter(e=>e.eventId.startsWith('seq-'));assert.equal(sequential.length,40);assert.equal(sequential.reduce((sum,e)=>sum+e.dependencies.length,0),40);
 b=new SheetReplica(context,B,a.exportUpdate());c=new SheetReplica(context,{...A,sessionId:'tab-C'},a.exportUpdate());
 for(let i=0;i<10;i++)a.commit({kind:'cell.commit',key,input:{kind:'literal',value:100+i}},`branch-A-${i}`);
 for(let i=0;i<8;i++)b.commit({kind:'cell.commit',key,input:{kind:'literal',value:200+i}},`branch-B-${i}`);
 for(let i=0;i<6;i++)c.commit({kind:'cell.commit',key,input:{kind:'literal',value:300+i}},`branch-C-${i}`);
 a.receive(b.exportUpdate());a.receive(c.exportUpdate());const join=a.commit({kind:'cell.commit',key,input:{kind:'literal',value:999}},'join-three');assert.equal(join.event.dependencies.length,3);
 sync(a,b);sync(a,c);assert.equal(value(a.projection,key),999);
 a.undo('join-three','undo-join');sync(a,b);sync(a,c);assert.notEqual(value(a.projection,key),999);
 assert.ok(a.projection.cells[encodeCellKey(key)]?.alternatives.some(alt=>alt.sessionId===B.sessionId&&alt.input.kind==='literal'&&alt.input.value===207));
 assert.ok(a.projection.cells[encodeCellKey(key)]?.alternatives.some(alt=>alt.sessionId==='tab-C'&&alt.input.kind==='literal'&&alt.input.value===305));
 }finally{a.destroy();b?.destroy();c?.destroy();}
});
