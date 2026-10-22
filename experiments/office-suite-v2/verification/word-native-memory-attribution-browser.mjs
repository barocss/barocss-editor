// Reuse the exact original workload/bootstrap/completion API. No production patch.
import './word-performance-browser.mjs';
const api=window.m0WordPerformance;
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function snapshot(){
 const memory=performance.memory;
 const host=document.getElementById('host');
 return {
  pageUtc:new Date().toISOString(),pageMonotonicMs:performance.now(),pageTimeOrigin:performance.timeOrigin,
  media:{printMatches:matchMedia('print').matches,note:'No emulateMedia or media-mode change'},
  heap:memory&&Number.isFinite(memory.usedJSHeapSize)&&Number.isFinite(memory.totalJSHeapSize)?{status:'available',usedJSHeapSize:memory.usedJSHeapSize,totalJSHeapSize:memory.totalJSHeapSize,jsHeapSizeLimit:memory.jsHeapSizeLimit}:{status:'unavailable'},
  native:{rootId:host?.querySelector('.w-document')?.getAttribute('data-bc-sid')??null,surfaces:host?.querySelectorAll('.w-surface').length??0,pages:host?.querySelectorAll('.w-sheet').length??0,paragraphs:host?.querySelectorAll('.w-paragraph').length??0,printedPages:document.querySelector('.w-print-pages')?.children.length??0,globalLayoutEntries:window.wordLayout?.size??null,printApiPresent:!!window.wordPrintPages},
 };
}
window.m0WordNativeMemoryAttribution={
 snapshot,
 async open(){const result=await api.open(100);return {result,edge:snapshot(),boundary:'Existing API combines fixture/admission/mount/native stable frames and source TreeWalker inventory'};},
 fonts(){const result=api.fonts();return {result,edge:snapshot(),boundary:'Actual existing text walk/computed style plus later CDP font queries, not pure typography allocation'};},
 async warm(){const result=await api.render(100);return {result,edge:snapshot()};},
 print(){const result=api.print();return {result,edge:snapshot(),boundary:'Inline page heap at synchronous print return, before diagnostic geometry readout'};},
 async deferredReadout(){
  const root=document.getElementById('host')?.querySelector('.w-document');
  const printed=document.querySelector('.w-print-pages');
  const rects=[root,printed].map(el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});
  await frame();await frame();await frame();
  const media={printMatches:matchMedia('print').matches,boundary:'Media observed without override; no extra computed-style or stylesheet readout'};
  return {rects,media,edge:snapshot(),boundary:'Explicit geometry/computed-style reads can synchronously flush browser layout; three RAF callbacks are not paint completion or a forced native bootstrap'};
 },
 clearPrint(){api.clearPrint();return {edge:snapshot()};},
 dispose(){api.dispose();return {edge:snapshot()};},
};
