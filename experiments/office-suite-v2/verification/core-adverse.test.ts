import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbookContext,createEvent,projectWorkbook,validateEvent } from '../src/workbook.ts';
import { encodeCellKey } from '../src/contracts.ts';
import type { WorkbookEvent,WorkbookCommand,CellInput } from '../src/contracts.ts';
const context=createWorkbookContext({documentId:'independent',workbookId:'native',generation:'one'});
const key={sheetId:'main',rowId:'r0',columnId:'c0'};
function event(eventId:string,command:WorkbookCommand,dependencies:readonly string[],sessionId='A'){
 return createEvent(context,{eventId,actorId:`actor-${sessionId}`,sessionId},dependencies,command);
}
function seed():WorkbookEvent[]{
 const events:WorkbookEvent[]=[];
 const commands:WorkbookCommand[]=[{kind:'sheet.insert',sheetId:'main',name:'Main',afterSheetId:null},
 {kind:'axis.insert',sheetId:'main',axis:'row',id:'r0',afterId:null},{kind:'axis.insert',sheetId:'main',axis:'row',id:'r1',afterId:'r0'},
 {kind:'axis.insert',sheetId:'main',axis:'column',id:'c0',afterId:null},{kind:'sheet.insert',sheetId:'other',name:'Other',afterSheetId:'main'},
 {kind:'axis.insert',sheetId:'other',axis:'row',id:'or0',afterId:null},{kind:'axis.insert',sheetId:'other',axis:'column',id:'oc0',afterId:null}];
 commands.forEach((command,i)=>events.push(event(`seed-${i}`,command,i?[`seed-${i-1}`]:[],'seed')));return events;
}
function shuffled(input:readonly WorkbookEvent[],seed:number){const out=[...input];let state=seed;for(let i=out.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[out[i],out[j]]=[out[j]!,out[i]!];}return out;}
const literal=(value:number):CellInput=>({kind:'literal',value});
const formula:CellInput={kind:'formula',version:1,context:key,ast:{kind:'reference',reference:{sheetId:'other',rowId:'or0',columnId:'oc0',absRow:true,absColumn:false,sheetQualified:true}}};

test('50arrival orders yield identical native atomic alternatives and session undo result',()=>{
 const a=event('a-value',{kind:'cell.commit',key,input:literal(5)},['seed-6']);
 const b=event('b-formula',{kind:'cell.commit',key,input:formula},['seed-6'],'B');
 const before=projectWorkbook(context,[...seed(),a,b]);const alternatives=before.cells[encodeCellKey(key)]?.alternatives;
 assert.equal(alternatives?.length,2);assert.equal(alternatives?.filter(a=>a.state==='winner').length,1);assert.equal(alternatives?.filter(a=>a.state==='alternative').length,1);
 const undo=event('local-undo',{kind:'undo',targetEventId:a.eventId},[a.eventId,b.eventId]);
 const all=[...seed(),a,b,undo],expected=projectWorkbook(context,all);
 for(let i=1;i<=50;i++){const order=shuffled(all,i);const left:WorkbookEvent[]=[],right:WorkbookEvent[]=[];
  for(const next of order){left.push(next);projectWorkbook(context,left);}for(const next of [...order].reverse()){right.push(next);projectWorkbook(context,right);}
  assert.deepEqual(projectWorkbook(context,left),expected);assert.deepEqual(projectWorkbook(context,right),expected);
 }
 assert.deepEqual(expected.cells[encodeCellKey(key)]?.winner?.input,formula);assert.equal(expected.cells[encodeCellKey(key)]?.alternatives.find(a=>a.eventId==='a-value')?.state,'undone');
});
test('same-position rows and delete-versus-formula preserve identities and input in either arrival direction',()=>{
 const a=event('insert-A',{kind:'axis.insert',sheetId:'main',axis:'row',id:'new-A',afterId:'r0'},['seed-6']);
 const b=event('insert-B',{kind:'axis.insert',sheetId:'main',axis:'row',id:'new-B',afterId:'r0'},['seed-6'],'B');
 const del=event('delete-other',{kind:'axis.delete',sheetId:'other',axis:'row',id:'or0'},['seed-6']);
 const edit=event('formula-edit',{kind:'cell.commit',key,input:formula},['seed-6'],'B');
 const expected=projectWorkbook(context,[...seed(),a,b,del,edit]);
 for(let i=1;i<=20;i++)assert.deepEqual(projectWorkbook(context,shuffled([...seed(),a,b,del,edit],i)),expected);
 const main=expected.sheets.find(s=>s.id==='main')!;assert.equal(new Set(main.rows.map(r=>r.id)).size,main.rows.length);
 assert.deepEqual(main.rows.filter(r=>!r.deleted).map(r=>r.id),['r0','new-A','new-B','r1']);
 assert.deepEqual(expected.cells[encodeCellKey(key)]?.winner?.input,formula);assert.equal(expected.sheets.find(s=>s.id==='other')?.rows[0]?.deleted,true);
 // Formula evaluation/#REF requires Formula; retaining its stable reference is the native Core boundary here.
});
test('A-created row edited and referenced by B refuses A structural undo in all arrival orders',()=>{
 const insert=event('insert-A',{kind:'axis.insert',sheetId:'main',axis:'row',id:'created',afterId:'r0'},['seed-6']);
 const created={...key,rowId:'created'};const edit=event('remote-write',{kind:'cell.commit',key:created,input:literal(42)},[insert.eventId],'B');
 const undo=event('undo-A',{kind:'undo',targetEventId:insert.eventId},[edit.eventId]);
 const expected=projectWorkbook(context,[...seed(),insert,edit,undo]);
 for(let i=1;i<=20;i++)assert.deepEqual(projectWorkbook(context,shuffled([...seed(),insert,edit,undo],i)),expected);
 assert.deepEqual(expected.outcomes[undo.eventId],{status:'refused',code:'UNDO_CONFLICT',recoverable:true});assert.equal(expected.cells[encodeCellKey(created)]?.deleted,false);assert.deepEqual(expected.cells[encodeCellKey(created)]?.winner?.input,literal(42));
});
test('raw version/accessor/sparse collections reject before admission and duplicate identity cannot change its body',()=>{
 const good=seed()[0]!;let invoked=false;
 const accessor={...good};Object.defineProperty(accessor,'command',{enumerable:true,get(){invoked=true;throw new Error('getter ran');}});
 assert.equal(validateEvent(accessor,context).ok,false);assert.equal(invoked,false);
 assert.equal(validateEvent({...good,context:{...context,schemaVersion:2}},context).ok,false);
 assert.throws(()=>projectWorkbook(context,new Array<WorkbookEvent>(2)),/Invalid event collection/);
 const changed=event(good.eventId,{kind:'sheet.insert',sheetId:'changed',name:'Changed',afterSheetId:null},[],'seed');
 assert.throws(()=>projectWorkbook(context,[good,changed]),/body collision/);
});
