/** Bounded real Core/Formula workload. No alternate model or evaluator. */
import { createEvent,createWorkbookContext,projectWorkbook,diffWorkbook } from '../src/workbook.ts';
import { encodeCellKey } from '../src/contracts.ts';
import { SHEET_PROFILE,sheetInputs } from './profiles.ts';
import { environment,sourceBinding,summarize } from './metrics.ts';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';

const here=dirname(fileURLToPath(import.meta.url));const root=resolve(here,'../../..');const out=resolve(here,'reports');mkdirSync(out,{recursive:true});
const paths=['experiments/office-suite-v2/src/contracts.ts','experiments/office-suite-v2/src/workbook.ts','experiments/office-suite-v2/verification/sheet-scale.mjs','experiments/office-suite-v2/verification/profiles.ts'];
const calculationPath=resolve(here,'../src/calculation.ts');
const runId=process.argv[2]==='--child'?process.argv[4]:new Date().toISOString().replace(/[:.]/g,'-');
const report={runId,schema:'office-v2-m0/sheet-scale-v1',profile:SHEET_PROFILE,environment:environment(),source:sourceBinding(root,[...paths,...(existsSync(calculationPath)?['experiments/office-suite-v2/src/calculation.ts','experiments/office-suite-v2/src/formula.ts','experiments/office-suite-v2/src/references.ts']:[])]),
 bounds:{perSampleTimeoutMs:60000,maxOldSpaceMiB:768,samples:Number(process.env.M0_SCALE_SAMPLES??3)},samples:[],status:'NOT RUN',limitations:['Headless model/calculation only: no Canvas, scroll, keystroke-to-paint or physical IME.','Ambient host contention is uncontrolled; no acceptance budget or clean-machine capacity claim.','Main sheet has10000rows/100columns; second sheet is empty.50k populated include10k formulas.','Formula AST fixtures use the actual frozen native SUM/range contract, not a second parser/evaluator.']};
const reportFile=resolve(out,'sheet-scale.json');
function save(){writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');}
if(process.argv[2]==='--child'){
 const sample=Number(process.argv[3]);const sampleFile=resolve(out,`sheet-scale-${runId}-${sample}.json`);
 const row={sample,environment:environment(),source:report.source,phases:[],status:'NOT RUN'};
 const phase=(name,fn)=>{const start=performance.now();const value=fn();row.phases.push({name,elapsedMs:performance.now()-start,memory:process.memoryUsage(),loadAverage:loadavg()});writeFileSync(sampleFile,JSON.stringify(row,null,2)+'\n');return value;};
 try{
  const {CalculationEngine}=await import(calculationPath);if(typeof CalculationEngine!=='function')throw new Error('Actual Formula export CalculationEngine missing');
  const context=createWorkbookContext({documentId:'scale',workbookId:'native-scale',generation:'scale-g1'});const events=[];
  const emit=(command)=>{const id=`e${String(events.length).padStart(6,'0')}`;const event=createEvent(context,{eventId:id,actorId:'scale-actor',sessionId:'scale-session'},events.length?[events.at(-1).eventId]:[],command);events.push(event);return event;};
  phase('construct-native-events',()=>{
   emit({kind:'sheet.insert',sheetId:'main',name:'Main',afterSheetId:null});emit({kind:'sheet.insert',sheetId:'other',name:'Other',afterSheetId:'main'});
   for(let column=0;column<SHEET_PROFILE.columns;column++)emit({kind:'axis.insert',sheetId:'main',axis:'column',id:`c${column}`,afterId:column?`c${column-1}`:null});
   for(let row=0;row<SHEET_PROFILE.rows;row++)emit({kind:'axis.insert',sheetId:'main',axis:'row',id:`r${row}`,afterId:row?`r${row-1}`:null});
   let batch=[];
   for(const cell of sheetInputs()){
    const key={sheetId:'main',rowId:`r${cell.row}`,columnId:`c${cell.column}`};
    const reference=column=>({sheetId:'main',rowId:`r${cell.row}`,columnId:`c${column}`,absRow:false,absColumn:false,sheetQualified:false});
    const input=cell.kind==='literal'?{kind:'literal',value:cell.value}:{kind:'formula',version:1,context:key,ast:{kind:'call',name:'SUM',arguments:[{kind:'range',reference:{start:reference(0),end:reference(3),policy:'live-interval'}}]}};
    batch.push({key,input});if(batch.length===1000){emit({kind:'cells.commit',changes:batch});batch=[];}
   }
   if(batch.length)emit({kind:'cells.commit',changes:batch});
  });
  const projection=phase('cold-native-projection',()=>projectWorkbook(context,events));
  const population=Object.values(projection.cells);row.population={sheets:projection.sheets.length,rows:projection.sheets[0].rows.length,columns:projection.sheets[0].columns.length,cells:population.length,formulas:population.filter(c=>c.winner?.input.kind==='formula').length,events:events.length,revisionBytes:Buffer.byteLength(projection.revision)};
  if(row.population.cells!==50000||row.population.formulas!==10000||row.population.rows!==10000||row.population.columns!==100)throw new Error('Actual native population differs from named profile');
  const engine=phase('register-calculation',()=>new CalculationEngine(projection));phase('initial-recalculate',()=>engine.recalculate());row.initialStats={...engine.stats};
  const value=(rowIndex)=>{const result=engine.read({sheetId:'main',rowId:`r${rowIndex}`,columnId:'c4'},engine.token);if(result.status!=='fresh')throw new Error(`Stale formula${rowIndex}`);return result.value;};
  if(value(0)!==10||value(9999)!==40006)throw new Error('Scale formula fixture values differ');
  emit({kind:'cell.commit',key:{sheetId:'main',rowId:'r0',columnId:'c0'},input:{kind:'literal',value:999}});
  const after=phase('edit-native-projection',()=>projectWorkbook(context,events));const diff=phase('edit-native-diff',()=>diffWorkbook(projection,after));
  phase('edit-calculation-update',()=>engine.update(after,diff,engine.token));phase('dirty-recalculate',()=>engine.recalculate());row.dirtyStats={...engine.stats};if(value(0)!==1008)throw new Error('Dirty formula did not update');
  const changes=[];for(let row=100;row<350;row++)for(let column=0;column<4;column++)changes.push({key:{sheetId:'main',rowId:`r${row}`,columnId:`c${column}`},input:{kind:'literal',value:2}});
  emit({kind:'cells.commit',changes});const pasted=phase('paste-native-projection',()=>projectWorkbook(context,events));const pasteDiff=phase('paste-native-diff',()=>diffWorkbook(after,pasted));
  phase('paste-calculation-update',()=>engine.update(pasted,pasteDiff,engine.token));phase('paste-recalculate',()=>engine.recalculate());row.pasteStats={...engine.stats};if(value(100)!==8||value(349)!==8)throw new Error('Pasted cells did not recalculate');
  row.status='PASS: bounded real model workload';
 }catch(error){row.status='FAIL';row.firstFailure=String(error);process.exitCode=1;}
 writeFileSync(sampleFile,JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify({sample,status:row.status}));
}else{
 if(!Number.isInteger(report.bounds.samples)||report.bounds.samples<1||report.bounds.samples>7)throw new Error('M0_SCALE_SAMPLES must be1..7');
 if(!existsSync(calculationPath)){report.status='NOT RUN';report.reason='Actual delivered Formula src/calculation.ts absent; no fake evaluator used';save();process.exitCode=2;}
 else{
  for(let sample=0;sample<report.bounds.samples;sample++){
   const child=spawnSync(process.execPath,['--max-old-space-size=768',fileURLToPath(import.meta.url),'--child',String(sample),runId],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
   const sampleFile=resolve(out,`sheet-scale-${runId}-${sample}.json`);const partial=existsSync(sampleFile)?JSON.parse(readFileSync(sampleFile,'utf8')):{sample,status:'FAIL',phases:[]};
   partial.process={exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,stdout:child.stdout,stderr:child.stderr};
   if(child.status!==0){partial.status='FAIL';partial.firstFailure??=partial.process.error??`Child exit${child.status}/${child.signal}`;report.samples.push(partial);report.status='FAIL';report.firstFailure=partial.firstFailure;save();process.exitCode=1;break;}
   report.samples.push(partial);save();
  }
  if(report.samples.length===report.bounds.samples&&report.samples.every(s=>s.status.startsWith('PASS'))){report.status='PASS: observational headless workload only';
   report.percentiles=report.samples[0].phases.map(phase=>({phase:phase.name,elapsedMs:summarize(report.samples.map(sample=>sample.phases.find(p=>p.name===phase.name).elapsedMs)),rssBytes:summarize(report.samples.map(sample=>sample.phases.find(p=>p.name===phase.name).memory.rss))}));}
  save();console.log(JSON.stringify({status:report.status,samples:report.samples.length}));
 }
}
