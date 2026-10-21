import {mountWordRuntime,assertWordNativeDocument} from '@m0-word-runtime';
import {wordDocument} from './profiles.ts';
import '@m0-word-css';import '@m0-text-css';
window.m0Tiny=async function(){
 const native=wordDocument(100);native.content.find(n=>n.stype==='surface').content.splice(16);
 const report={fixture:'Same100-group generator, bounded to first16paragraphs/two explicit groups',observer:{sheet:'.w-sheet',surface:'.w-surface',paragraph:'.w-paragraph'},schemaAdmission:'NOT RUN'};
 try{assertWordNativeDocument(native);report.schemaAdmission='PASS';}catch(error){report.schemaAdmission='FAIL';report.schemaFailure=String(error);}
 delete window.wordLayout;const runtime=mountWordRuntime(document.getElementById('host'),{initialDocument:native,editable:true,debug:true});
 try{
  await document.fonts.ready;for(let i=0;i<6;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
  const rootId=runtime.editor.getRootId(),root=runtime.editor.dataStore.getNode(rootId);
  report.runtime={rootId,rootType:root?.stype,rootDomId:document.querySelector('.w-document')?.getAttribute('data-bc-sid'),documentFaults:runtime.editor.documentFaults,viewClass:runtime.view.constructor.name,
   modelSurfaceChildren:runtime.editor.exportDocument().content?.filter(n=>n.stype==='surface').map(n=>({sid:n.sid,stype:n.stype,attributes:n.attributes,children:n.content?.length})),
   surfaceDom:[...document.querySelectorAll('.w-surface')].map(el=>({id:el.getAttribute('data-bc-sid'),className:el.className,modelType:runtime.editor.dataStore.getNode(el.getAttribute('data-bc-sid'))?.stype})),
   documentClass:document.querySelector('.w-document')?.className,surfaceCount:document.querySelectorAll('.w-surface').length,paragraphCount:document.querySelectorAll('.w-paragraph').length,sheetCount:document.querySelectorAll('.w-sheet').length,
   layoutMap:window.wordLayout?[...window.wordLayout].map(([id,l])=>({id,pages:l.pages.length,fragments:l.pages.map(p=>p.fragments.length)})):null};
  runtime.view.render(undefined,{sync:true});await new Promise(resolve=>requestAnimationFrame(resolve));report.afterExplicitRender={sheetCount:document.querySelectorAll('.w-sheet').length,layoutKeys:window.wordLayout?[...window.wordLayout.keys()]:null};
 }finally{runtime.dispose();}
 return report;
};
