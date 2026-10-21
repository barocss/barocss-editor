/** Diagnostic read brackets are sequential observations, never an atomic sample. */
export interface DiagnosticStamp {utc:string;monotonicMs:number}
export interface DiagnosticReadRecord<T> {name:string;started:DiagnosticStamp;status:string;ended?:DiagnosticStamp;collectionSkewMs?:number;value?:T;error?:string}
export const diagnosticStamp=():DiagnosticStamp=>({utc:new Date().toISOString(),monotonicMs:performance.now()});
export async function diagnosticRead<T>(name:string,read:()=>T|Promise<T>,clock:()=>DiagnosticStamp=diagnosticStamp,observe:(record:DiagnosticReadRecord<T>)=>void=()=>{}){
 const started=clock();const record:DiagnosticReadRecord<T>={name,started,status:'RUNNING'};observe(record);
 try{
  const value=await read();const ended=clock();
  if(record.status==='ABORTED')throw new Error(record.error??'Diagnostic read aborted');
  if(!Number.isFinite(started.monotonicMs)||!Number.isFinite(ended.monotonicMs)||ended.monotonicMs<started.monotonicMs)throw new Error('Invalid diagnostic clock bracket');
  Object.assign(record,{status:'COMPLETED',ended,collectionSkewMs:ended.monotonicMs-started.monotonicMs,value});observe(record);
  return {name,started,ended,collectionSkewMs:ended.monotonicMs-started.monotonicMs,value,status:'COMPLETED'};
 }catch(error){record.status='FAILED';record.error??=String(error);record.ended??=clock();record.collectionSkewMs??=record.ended.monotonicMs-started.monotonicMs;observe(record);throw error;}
}
