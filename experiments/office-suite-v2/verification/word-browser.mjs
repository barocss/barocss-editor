import { mountWordRuntime } from '@m0-word-runtime';
import { readWordDocx } from '@m0-docx-import';
import { exportWordDocx } from '@m0-docx-export';
import { wordDocument } from './profiles.ts';
import '@m0-word-css';
import '@m0-text-css';

let runtime;
const frame = () => new Promise(resolve=>requestAnimationFrame(resolve));
async function settle(timeoutMs=45000) {
  const start=performance.now(); let previous='',same=0;
  while(performance.now()-start<timeoutMs) {
    await frame();
    const layouts=window.wordLayout;
    const signature=layouts ? JSON.stringify([...layouts].map(([id,l])=>[id,l.pages.length,l.totalHeight,l.pages.map(p=>p.fragments.length)])) : '';
    if(signature && signature===previous) same++; else same=0;
    previous=signature;
    if(same>=4 && document.querySelectorAll('.w-sheet').length>0) return {pages:document.querySelectorAll('.w-sheet').length,signature};
  }
  throw new Error('Actual Word layout did not stabilize within45s');
}
function dispose(){runtime?.dispose();runtime=undefined;document.getElementById('host').replaceChildren();}
window.m0Word={
  async open(pages){
    dispose(); await document.fonts.ready;
    const native=wordDocument(pages); const started=performance.now();
    runtime=mountWordRuntime(document.getElementById('host'),{initialDocument:native,editable:true,debug:true});
    await document.fonts.ready;
    const settled=await settle();
    const elapsedMs=performance.now()-started;
    return {elapsedMs,pages:settled.pages,expectedPages:pages,sourceParagraphs:pages*8,sourceElements:document.querySelector('.w-document')?.querySelectorAll('*').length,
      fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),bodyFont:getComputedStyle(document.querySelector('.w-paragraph')).fontFamily};
  },
  async render(){const start=performance.now();runtime.view.render(undefined,{sync:true});await settle();return performance.now()-start;},
  print(){const before=document.querySelector('.w-document').querySelectorAll('*').length;const started=performance.now();const pages=window.wordPrintPages.build();
    const elapsedMs=performance.now()-started;return {pages,elapsedMs,sourceElements:before,printedElements:document.querySelector('.w-print-pages').querySelectorAll('*').length,printPageCopies:document.querySelectorAll('.w-print-copy').length};},
  clearPrint(){window.wordPrintPages.clear();},
  docx(bytes){
    const imported=readWordDocx(new Uint8Array(bytes),'Synthetic corpus');
    const exported=exportWordDocx(imported.document);
    const reopened=readWordDocx(exported.bytes,'Synthetic exported copy');
    const counts=(node)=>{const found={};const visit=n=>{found[n.stype]=(found[n.stype]??0)+1;for(const c of n.content??[]) visit(c);};visit(node);return found;};
    const text=n=>(n.text??'')+(n.content??[]).map(text).join('');
    return {importWarnings:imported.warnings,exportWarnings:exported.warnings,reopenWarnings:reopened.warnings,counts:counts(imported.document),reopenCounts:counts(reopened.document),importText:text(imported.document),reopenText:text(reopened.document),exportBytes:Array.from(exported.bytes)};
  },dispose
};
