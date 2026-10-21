import {execFileSync} from 'node:child_process';
import {loadavg} from 'node:os';

/** Starts before browser launch. Late owned handles must be retired by their caller. */
export function createSampleWallGuard(limitMs:number,onExpire:()=>void){
 if(!Number.isFinite(limitMs)||limitMs<=0)throw new Error('Positive sample wall limit required');
 const deadline=performance.now()+limitMs,error=new Error(`Sample wall exceeded${limitMs}ms`);
 let expired=false,stopped=false,rejectExpiry:(error:Error)=>void=()=>{};
 const expiry=new Promise<never>((_,reject)=>{rejectExpiry=reject;});
 // A guard may expire between awaited operations. Its rejection is observed by run().
 void expiry.catch(()=>{});
 const expire=()=>{if(expired||stopped)return;expired=true;rejectExpiry(error);onExpire();};
 const timer=setTimeout(expire,limitMs);
 const remainingMs=()=>{if(performance.now()>=deadline)expire();if(expired||stopped)throw error;return Math.max(1,Math.ceil(deadline-performance.now()));};
 return {
  remainingMs,
  async run<T>(operation:()=>Promise<T>,retireLate?:(value:T)=>Promise<unknown>):Promise<T>{
   remainingMs();
   const work=Promise.resolve().then(()=>{remainingMs();return operation();}).then(async value=>{if(performance.now()>=deadline)expire();if(expired||stopped){await retireLate?.(value);throw error;}return value;});
   return Promise.race([work,expiry]);
  },
  stop(){stopped=true;clearTimeout(timer);},
 };
}
/** Guard data is limited to the descendants of the browser process we created. */
export interface ProcessMemory {pid:number;parentPid:number;rssBytes:number;cpuPercent:number}
export function ownedBrowserMemory(output:string,rootPid:number){
 if(!Number.isSafeInteger(rootPid)||rootPid<=0)throw new Error('Invalid owned browser PID');
 const rows:ProcessMemory[]=output.split('\n').flatMap(line=>{const parts=line.trim().split(/\s+/);if(parts.length!==4)return [];const [pid,parentPid,kib,cpuPercent]=parts.map(Number);
  if(![pid,parentPid,kib,cpuPercent].every(Number.isFinite)||!Number.isInteger(pid)||!Number.isInteger(parentPid)||pid!<=0||parentPid!<0||kib!<0||cpuPercent!<0)return [];
  return [{pid:pid!,parentPid:parentPid!,rssBytes:kib!*1024,cpuPercent:cpuPercent!}];});
 if(!rows.some(row=>row.pid===rootPid))return {rootPresent:false,processes:[] as ProcessMemory[],aggregateRssBytes:0};
 const owned=new Set([rootPid]);let changed=true;while(changed){changed=false;for(const row of rows)if(owned.has(row.parentPid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}
 const processes=rows.filter(row=>owned.has(row.pid));return {rootPresent:true,processes,aggregateRssBytes:processes.reduce((sum,row)=>sum+row.rssBytes,0)};
}
export function variability(values:readonly number[]){
 if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Expected finite nonnegative observations');
 const mean=values.reduce((sum,n)=>sum+n,0)/values.length;
 const standardDeviation=Math.sqrt(values.reduce((sum,n)=>sum+(n-mean)**2,0)/values.length);
 return {count:values.length,mean,populationStandardDeviation:standardDeviation,coefficientOfVariation:mean===0?0:standardDeviation/mean};
}

export function repeatableMeasurements(values:readonly number[]){
 const stats=variability(values),absoluteSpreadMs=Math.max(...values)-Math.min(...values);
 return {...stats,absoluteSpreadMs,qualified:stats.count>=3&&(stats.coefficientOfVariation<=.25||absoluteSpreadMs<=10)};
}

export function readReferencePressure(){
 const vm=execFileSync('vm_stat',{encoding:'utf8'}),pressure=execFileSync('memory_pressure',['-Q'],{encoding:'utf8'});
 const count=(name:string)=>Number(new RegExp(`^${name}:\\s+(\\d+)`,'m').exec(vm)?.[1]??NaN);
 return {capturedUtc:new Date().toISOString(),load:loadavg(),memoryFreePercent:Number(/free percentage:\s+(\d+)/.exec(pressure)?.[1]??NaN),pageBytes:Number(/page size of (\d+) bytes/.exec(vm)?.[1]??NaN),swapins:count('Swapins'),swapouts:count('Swapouts'),swapusage:execFileSync('sysctl',['vm.swapusage'],{encoding:'utf8'}).trim()};
}
