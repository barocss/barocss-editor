import {mountWordRuntime,assertWordNativeDocument} from '@m0-word-runtime';
import {wordDocument} from './profiles.ts';
import '@m0-word-css';import '@m0-text-css';
let runtime;
// Read-only observer of the exact W view source. No method/flag is changed.
function completion(){if(typeof runtime?.view._contentRenderPending!=='boolean')throw new Error('Pinned committed-content view completion state required');return {generation:runtime.view._renderGeneration,contentPending:runtime.view._contentRenderPending,rendering:runtime.view._isRendering,runningLayout:runtime.view._runningLayoutPasses,modelDrivenRenders:runtime.view._modelDrivenRenders,layoutRounds:runtime.view._layoutRounds};}
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function stable(expected){const end=performance.now()+5000;let previous='',same=0;
 while(performance.now()<end){await frame();const layouts=window.wordLayout;
  const signature=layouts?JSON.stringify([...layouts].map(([id,l])=>[id,l.pages.length,l.totalHeight,l.pages.map(p=>p.fragments.length)])):'';
  const actual=document.querySelectorAll('.w-sheet').length;
  const state=completion();const finished=!state.contentPending&&!state.rendering&&!state.runningLayout&&state.modelDrivenRenders===0;
  if(signature&&signature===previous&&actual===expected&&finished)same++;else same=0;previous=signature;
  if(same>=3)return {pages:actual,layout:[...layouts].map(([id,l])=>({id,pages:l.pages.length})),surfaceCount:document.querySelectorAll('.w-surface').length,completion:state};}
 throw new Error('Actual normal Word layout not stable within5s; no forced bootstrap allowed');}
function nodeCounts(root){if(!root)throw new Error('Missing actual document/print container');let elements=0,textNodes=0;const walker=document.createTreeWalker(root,NodeFilter.SHOW_ALL);let node;
 while((node=walker.nextNode())){if(node.nodeType===Node.ELEMENT_NODE)elements++;else if(node.nodeType===Node.TEXT_NODE)textNodes++;}return {elements,textNodes};}
window.m0WordPerformance={
 async open(pages){
  const fixtureStart=performance.now();const fixture=wordDocument(pages);const fixtureBuildMs=performance.now()-fixtureStart;
  const started=performance.now();assertWordNativeDocument(fixture);const admissionMs=performance.now()-started;
  delete window.wordLayout;const mountStart=performance.now();runtime=mountWordRuntime(document.getElementById('host'),{initialDocument:fixture,editable:true,debug:true});
  await document.fonts.ready;const result=await stable(pages);const layoutMs=performance.now()-mountStart;
  return {fixtureBuildMs,admissionMs,normalMountToStableLayoutMs:layoutMs,coldOpenMs:performance.now()-started,...result,documentFaults:runtime.editor.documentFaults,rootId:runtime.editor.getRootId(),domRoot:document.querySelector('.w-document')?.getAttribute('data-bc-sid'),paragraphs:document.querySelectorAll('.w-paragraph').length,sourceNodes:nodeCounts(document.querySelector('.w-document'))};
 },
 async render(expected){const started=performance.now();runtime.view.render();const result=await stable(expected);return {elapsedMs:performance.now()-started,...result};},
 fonts(){const paragraphs=[...document.querySelectorAll('.w-paragraph')];const selected=[0,Math.floor(paragraphs.length/2),paragraphs.length-1];return selected.map((paragraphIndex,i)=>{const paragraph=paragraphs[paragraphIndex];if(!paragraph)throw new Error('No rendered paragraph');const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let text;
  while((text=walker.nextNode()))if(text.textContent.trim()){const target=text.parentElement,anchor=target.closest('[data-bc-sid]');if(!anchor)throw new Error('No native font target anchor');let selector=`[data-bc-sid="${CSS.escape(anchor.getAttribute('data-bc-sid'))}"]`;const tail=[];for(let node=target;node!==anchor;node=node.parentElement){tail.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...node.parentElement.children].indexOf(node)+1})`);}if(tail.length)selector+=' > '+tail.join(' > ');const style=getComputedStyle(target);return {paragraphIndex,selector,fontFamily:style.fontFamily,fontSize:style.fontSize,textSample:text.textContent.slice(0,60)};}throw new Error('Paragraph has no rendered text');});},
 print(){const started=performance.now();const pages=window.wordPrintPages.build();return {pages,buildMs:performance.now()-started};},
 printedNodes(){return {...nodeCounts(document.querySelector('.w-print-pages')),copies:document.querySelectorAll('.w-print-copy').length,pages:document.querySelectorAll('.w-print-page').length};},
 clearPrint(){window.wordPrintPages.clear();},
 dispose(){runtime?.dispose();runtime=undefined;}
};
