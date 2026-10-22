/** Native allocation samples are attributed samples, never live/resident bytes. */
import {createHash} from 'node:crypto';
import {diagnosticStamp,type DiagnosticStamp} from './word-memory-diagnostic-record.ts';
type Send=(method:string,params?:Record<string,unknown>)=>Promise<unknown>;
type Row=Record<string,unknown>;
type Options={send:Send;remainingMs:()=>number;observe:()=>void;clock?:()=>DiagnosticStamp;commandTimeoutMs?:number;profileLimitBytes?:number;totalLimitBytes?:number};
export const isMissingNativeMethod=(error:unknown):boolean=>typeof error==='object'&&error!==null&&'code' in error&&error.code===-32601;
export function runtimeHeapSeries(value:unknown){
 const raw=value as Record<string,unknown>|null;const fields=['usedSize','totalSize','embedderHeapUsedSize','backingStorageSize'] as const;
 const values=Object.fromEntries(fields.map(key=>[key,typeof raw?.[key]==='number'&&Number.isFinite(raw[key])&&(raw[key] as number)>=0?raw[key]:null]));
 return {status:Object.values(values).every(x=>x!==null)?'available':'unavailable-or-partial',values,scope:'Corresponding isolate total, not page/Runtime scoped; embedder GC heap and backing storage are separate series, not all native/RSS'};
}
export class NativeMemoryRecorder {
 readonly commands:Row[]=[];readonly windows:Row[]=[];readonly cleanupRecords:Row[]=[];mayBeActive=false;stopAttempted=false;nativeUnavailable:string|null=null;runtimeUnavailable:string|null=null;retainedProfileBytes=0;failed=false;
 readonly options:Options;
 constructor(options:Options){this.options=options;}
 private stamp(){return (this.options.clock??diagnosticStamp)();}
 async command(method:string,params:Record<string,unknown>={},cleanupRemainingMs?:number,onDispatch:()=>void=()=>{}){
  const limit=Math.min(this.options.commandTimeoutMs??5000,cleanupRemainingMs??this.options.remainingMs());
  if(!Number.isFinite(limit)||limit<=0)throw new Error('No remaining command budget: '+method);
  const started=this.stamp();const row:Row={method,params,started,status:'RUNNING',timeoutMs:limit,cleanup:cleanupRemainingMs!==undefined};this.commands.push(row);this.options.observe();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([Promise.resolve().then(()=>{if(this.stamp().monotonicMs>=started.monotonicMs+limit)throw new Error(method+' deadline before dispatch');row.dispatchRequested=this.stamp();this.options.observe();if(this.stamp().monotonicMs>=started.monotonicMs+limit)throw new Error(method+' deadline before actual dispatch');row.dispatched=this.stamp();onDispatch();const pending=this.options.send(method,params);this.options.observe();return pending;}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(method+' command timeout')),limit);})]);
   if(this.stamp().monotonicMs>=started.monotonicMs+limit){row.returnedAfterDeadline='Rejected late response; body not accepted after guard';throw new Error(method+' settled after command deadline');}
   row.status='COMPLETED';row.response=method==='Memory.getSamplingProfile'?{bodyStoredOnlyInWindow:true}:result;return result;
  }catch(error){row.status='FAILED';row.error=String(error);row.verifiedProtocolCode=isMissingNativeMethod(error)?-32601:null;throw error;}
  finally{clearTimeout(timer);row.ended=this.stamp();this.options.observe();}
 }
 async heapUsage(){
  if(this.runtimeUnavailable)return {...runtimeHeapSeries(null),status:'UNAVAILABLE',reason:this.runtimeUnavailable};
  try{const value=await this.command('Runtime.getHeapUsage');if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Runtime heap response schema');return runtimeHeapSeries(value);}
  catch(error){if(!isMissingNativeMethod(error))throw error;this.runtimeUnavailable='Verified structured -32601 for requested Runtime.getHeapUsage';this.options.observe();return {...runtimeHeapSeries(null),status:'UNAVAILABLE',reason:this.runtimeUnavailable};}
 }
 private retainProfile(row:Row,response:unknown){
  const json=JSON.stringify(response);if(typeof json!=='string')throw new Error('Native profile response is not JSON');
  const bytes=Buffer.byteLength(json);row.receivedJsonBytes=bytes;row.receivedJsonSha256=createHash('sha256').update(json).digest('hex');
  row.capBoundary='Post-materialization/serialization acceptance+storage guard, not backend/network/preallocation bound';
  if(bytes>(this.options.profileLimitBytes??16*1024**2)||this.retainedProfileBytes+bytes>(this.options.totalLimitBytes??32*1024**2)){
   row.profileBody='OMITTED oversized response';this.options.observe();throw new Error('Native profile post-receipt storage cap exceeded');
  }
  this.retainedProfileBytes+=bytes;row.response=response;this.options.observe();
  const profile=(response as {profile?:{samples?:unknown;modules?:unknown}})?.profile;
  if(!profile||!Array.isArray(profile.samples)||!Array.isArray(profile.modules))throw new Error('Invalid native profile arrays');
  for(const item of profile.samples){const x=item as {size?:unknown;total?:unknown;stack?:unknown};if(typeof x.size!=='number'||!Number.isFinite(x.size)||x.size<0||typeof x.total!=='number'||!Number.isFinite(x.total)||x.total<0||!Array.isArray(x.stack)||!x.stack.every(s=>typeof s==='string'))throw new Error('Invalid native allocation sample');}
  for(const item of profile.modules){const x=item as {name?:unknown;uuid?:unknown;baseAddress?:unknown;size?:unknown};if(typeof x.name!=='string'||typeof x.uuid!=='string'||typeof x.baseAddress!=='string'||typeof x.size!=='number'||!Number.isFinite(x.size)||x.size<0)throw new Error('Invalid native module metadata');}
  row.profileStatus=profile.samples.length?'CAPTURED sampled attribution only':'SUPPORTED EMPTY profile; not zero-allocation proof';this.options.observe();
 }
 private async stop(row:Row,cleanupRemainingMs?:number){
  if(!this.mayBeActive||this.stopAttempted)return;
  row.stopRequested=this.stamp();this.options.observe();
  try{const ack=await this.command('Memory.stopSampling',{},cleanupRemainingMs,()=>{this.stopAttempted=true;});if(ack===null||typeof ack!=='object'||Array.isArray(ack))throw new Error('Invalid native stop acknowledgement');this.mayBeActive=false;row.stopStatus='ACKNOWLEDGED';}
  catch(error){row.stopStatus=this.stopAttempted?'FAILED uncertain sampler state; owned browser must be killed':'NOT DISPATCHED; independent cleanup remains eligible';row.stopError=String(error);throw error;}
  finally{this.options.observe();}
 }
 async window<T>(name:'cold'|'warm'|'print',operation:()=>Promise<T>,pairedReadout:(result:T)=>Promise<unknown>):Promise<T>{
  if(this.failed)throw new Error('Prior native window failed; no retry');
  if(this.windows.length>=3||this.windows.some(x=>x.name===name))throw new Error('Native sampling window count/name reuse forbidden');
  const row:Row={name,started:this.stamp(),status:'START_REQUESTED',includes:'Actual API/completion plus inline edge, pairedreadsets and profilequery allocation/scheduling; not pure function allocation'};this.windows.push(row);this.stopAttempted=false;this.options.observe();let failure:{error:unknown}|null=null;let completed:{value:T}|null=null;
  try{
   if(!this.nativeUnavailable){
    this.mayBeActive=true;this.options.observe();
    try{const ack=await this.command('Memory.startSampling',{samplingInterval:131072,suppressRandomness:false});if(ack===null||typeof ack!=='object'||Array.isArray(ack))throw new Error('Invalid native start acknowledgement');row.samplingStarted=this.stamp();row.sampler='STARTED';}
    catch(error){if(!isMissingNativeMethod(error))throw error;this.mayBeActive=false;this.nativeUnavailable='Verified structured -32601 for requested Memory.startSampling';row.sampler='UNAVAILABLE';}
   }else row.sampler='UNAVAILABLE: future sampling start skipped';
   row.unavailableReason=this.nativeUnavailable;row.actualOperationStarted=this.stamp();this.options.observe();const result=await operation();row.actualOperationEnded=this.stamp();this.options.observe();
   await pairedReadout(result);row.pairedReadoutEnded=this.stamp();this.options.observe();
   if(this.mayBeActive){try{this.retainProfile(row,await this.command('Memory.getSamplingProfile'));}catch(error){if(!isMissingNativeMethod(error))throw error;this.nativeUnavailable='Verified structured -32601 for requested Memory.getSamplingProfile';row.profileStatus='UNAVAILABLE; future starts skipped';row.unavailableReason=this.nativeUnavailable;}}
   row.status=this.nativeUnavailable?'COMPLETED public API/readsets; sampling UNAVAILABLE':'COMPLETED diagnostic window';completed={value:result};
  }catch(error){failure={error};this.failed=true;row.status='FAILED';row.firstFailure=String(error);}
  finally{
   try{await this.stop(row);}catch(error){this.failed=true;row.status='FAILED';row.firstFailure??=String(error);failure??={error};}
   finally{row.ended=this.stamp();this.options.observe();}
  }
  if(failure)throw failure.error;
  if(!completed)throw new Error('Native window has no completed API result');
  return completed.value;
 }
 async cleanupStop(remainingMs:number){const row:Row={name:'failure-cleanup',started:this.stamp()};this.cleanupRecords.push(row);this.options.observe();try{await this.stop(row,remainingMs);return row;}finally{row.ended=this.stamp();this.options.observe();}}
}
