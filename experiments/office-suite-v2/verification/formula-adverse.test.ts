import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkbookContext,createEvent,projectWorkbook,diffWorkbook} from '../src/workbook.ts';
import type {WorkbookCommand,WorkbookEvent,CellKey,CellInput} from '../src/contracts.ts';
import {parseFormula,displayFormula} from '../src/formula.ts';
import {ReferenceIndex,transformCells} from '../src/references.ts';
import {CalculationEngine} from '../src/calculation.ts';

function fixture(){
 const context=createWorkbookContext({documentId:'verify-formula',workbookId:'book',generation:'g1'});const events:WorkbookEvent[]=[];
 const emit=(command:WorkbookCommand,sessionId='A',dependencies?:readonly string[])=>{const e=createEvent(context,{eventId:`event-${events.length}`,actorId:sessionId,sessionId},dependencies??(events.length?[events.at(-1)!.eventId]:[]),command);events.push(e);return e;};
 for(const sheetId of ['main','other']){emit({kind:'sheet.insert',sheetId,name:sheetId==='main'?'Main':'Other',afterSheetId:sheetId==='main'?null:'main'});
 for(let r=0;r<3;r++)emit({kind:'axis.insert',sheetId,axis:'row',id:`r${r}`,afterId:r?`r${r-1}`:null});
 for(let c=0;c<3;c++)emit({kind:'axis.insert',sheetId,axis:'column',id:`c${c}`,afterId:c?`c${c-1}`:null});}
 const project=()=>projectWorkbook(context,events);
 const put=(key:CellKey,value:number|string)=>{const input:CellInput=typeof value==='number'?{kind:'literal',value}:parseFormula(value,key,new ReferenceIndex(project()));assert.notEqual(input.kind,'invalid');return emit({kind:'cell.commit',key,input});};
 return {context,events,emit,project,put};
}
const key=(row:number,column:number,sheetId='main'):CellKey=>({sheetId,rowId:`r${row}`,columnId:`c${column}`});
function read(engine:CalculationEngine,key:CellKey){const result=engine.read(key);assert.equal(result.status,'fresh');if(result.status!=='fresh')throw new Error('Uncalculated');return result.value;}

test('actual range and cross-sheet references agree after concurrent insert, deletion and explicit same-ID restore',()=>{
 const f=fixture();for(let r=0;r<3;r++)f.put(key(r,0),r+1);f.put(key(0,0,'other'),7);
 const formulaKey=key(0,2);const formulaInput=parseFormula("=SUM(A1:A3)+Other!$A$1",formulaKey,new ReferenceIndex(f.project()));assert.equal(formulaInput.kind,'formula');
 const base=f.events.at(-1)!.eventId;
 const insertion=f.emit({kind:'axis.insert',sheetId:'main',axis:'row',id:'interior',afterId:'r0'},'A',[base]);
 f.emit({kind:'cell.commit',key:formulaKey,input:formulaInput},'B',[base]);
 f.emit({kind:'cell.commit',key:{sheetId:'main',rowId:'interior',columnId:'c0'},input:{kind:'literal',value:10}},'A',[insertion.eventId,f.events.at(-1)!.eventId]);
 const before=f.project();const reverse=projectWorkbook(f.context,[...f.events].reverse());assert.deepEqual(before,reverse);
 for(const projection of [before,reverse]){const calc=new CalculationEngine(projection);calc.recalculate();assert.equal(read(calc,formulaKey),23);}
 if(formulaInput.kind==='formula')assert.equal(displayFormula(formulaInput.ast,new ReferenceIndex(before)),"=(SUM(A1:A4)+'Other'!$A$1)");
 const deletion=f.emit({kind:'axis.delete',sheetId:'other',axis:'row',id:'r0'});const deleted=f.project();const calc=new CalculationEngine(deleted);calc.recalculate();assert.deepEqual(read(calc,formulaKey),{kind:'error',code:'#REF!'});
 f.emit({kind:'undo',targetEventId:deletion.eventId});const restored=f.project();calc.update(restored,diffWorkbook(deleted,restored),calc.token);calc.recalculate();assert.equal(read(calc,formulaKey),23);
});
test('actual copy differs from cross-sheet cut; both absolute and relative references follow moved content',()=>{
 const f=fixture();f.put(key(0,0),3);f.put(key(1,0),8);f.put(key(0,1),'=A1+$A$1');
 const beforeCopy=f.project();f.emit({kind:'cells.commit',changes:transformCells({kind:'copy',snapshot:beforeCopy,mapping:[{from:key(0,1),to:key(1,1)}]})});
 const copied=f.project();let calc=new CalculationEngine(copied);calc.recalculate();assert.equal(read(calc,key(0,1)),6);assert.equal(read(calc,key(1,1)),11);
 f.emit({kind:'cells.commit',changes:transformCells({kind:'cut',snapshot:copied,mapping:[{from:key(0,0),to:key(1,0,'other')}]})});
 const cut=f.project();calc=new CalculationEngine(cut);calc.recalculate();assert.equal(read(calc,key(0,0)),null);assert.equal(read(calc,key(1,0,'other')),3);assert.equal(read(calc,key(0,1)),6);assert.equal(read(calc,key(1,1)),11);
});
test('dirty closure evaluates one dependent formula and old revision result refuses freshness',()=>{
 const f=fixture();f.put(key(0,0),3);f.put(key(1,0),8);f.put(key(0,1),'=A1*2');f.put(key(1,1),'=A2*2');
 const before=f.project(),calc=new CalculationEngine(before);calc.recalculate();const old=calc.token,stats=calc.stats;
 f.put(key(1,0),9);const after=f.project();calc.update(after,diffWorkbook(before,after),old);
 assert.deepEqual(calc.read(key(1,1),old),{status:'stale'});assert.deepEqual(calc.read(key(1,1)),{status:'uncalculated'});
 calc.recalculate();assert.equal(read(calc,key(1,1)),18);assert.equal(read(calc,key(0,1)),6);assert.equal(calc.stats.evaluatedFormulas-stats.evaluatedFormulas,1);assert.equal(calc.stats.changedCellVisits-stats.changedCellVisits,1);
 assert.equal(calc.accepts(old),false);
});

// Oracle checked2026-10-21: https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel
// Inference from the published operator table: negation precedes exponent; equal precedence evaluates left-to-right.
test('Excel unary and exponent binding profile is explicit in actual parser/evaluator',()=>{
 for(const [source,expected] of [['=-2^2',4],['=2^3^2',64]] as const){const f=fixture();f.put(key(0,0),source);const calc=new CalculationEngine(f.project());calc.recalculate();assert.equal(read(calc,key(0,0)),expected,source);}
});
