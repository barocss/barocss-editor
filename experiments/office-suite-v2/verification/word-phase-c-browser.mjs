import {mountWordRuntime,assertWordNativeDocument} from '@m0-word-runtime';
import {EditorViewDOM} from '@m0-editor-view';
import {wordDocument} from './profiles.ts';
import '@m0-word-css';import '@m0-text-css';

let cleanup=()=>{};
window.m0Diagnostic=async function({pages=100,afterCommitRender=true}={}){
 const started=performance.now(),events=[],runtimeRef={current:undefined};let completeCount=0;
 const trace=(phase,data={})=>{if(events.length<120)events.push({phase,atMs:performance.now()-started,...data});};
 const dom=()=>({surfaces:[...document.querySelectorAll('.w-surface')].map(el=>({id:el.getAttribute('data-bc-sid'),children:el.children.length})),sheets:document.querySelectorAll('.w-sheet').length,paragraphs:document.querySelectorAll('.w-paragraph').length});
 const proto=EditorViewDOM.prototype,register=proto.registerLayoutPass,render=proto.render,run=proto._runLayoutPasses;
 const originals=new Map();
 proto.registerLayoutPass=function(pass){trace('register-layout-pass',{...dom()});return register.call(this,(...args)=>{const start=performance.now();trace('layout-pass-start',{...dom(),modelRoot:this.editor?.getRootId()});try{const patch=pass(...args);trace('layout-pass-end',{elapsedMs:performance.now()-start,patchKeys:patch?Object.keys(patch):[],...dom()});return patch;}catch(error){trace('layout-pass-throw',{error:String(error),stack:error?.stack});throw error;}});};
 proto._runLayoutPasses=function(...args){trace('run-layout-path',{running:this._runningLayoutPasses,rendering:this._isRendering,registered:this._layoutPasses?.length,...dom()});return run.apply(this,args);};
 proto.render=function(...args){
  if(this._domRenderer&&!originals.has(this._domRenderer)){const renderer=this._domRenderer,original=renderer.render;originals.set(renderer,original);renderer.render=function(...renderArgs){const options=renderArgs[5];renderArgs[5]={...options,onComplete:(...completeArgs)=>{completeCount++;trace('DOM-render-onComplete',{completeCount,...dom()});return options?.onComplete?.(...completeArgs);}};trace('DOM-render-call',{...dom()});return original.apply(this,renderArgs);};}
  trace('view-render-start',{root:this.editor?.getRootId(),surfaceRendererRegistered:!!this._rendererRegistry?.get('surface'),...dom()});
  try{return render.apply(this,args);}catch(error){trace('view-render-throw',{error:String(error),stack:error?.stack});throw error;}
 };
 const observer=new MutationObserver(()=>{if(!events.some(e=>e.phase==='first-surface-observed')&&document.querySelector('.w-surface'))trace('first-surface-observed',dom());});observer.observe(document.getElementById('host'),{subtree:true,childList:true});
 cleanup=()=>{runtimeRef.current?.dispose();observer.disconnect();proto.registerLayoutPass=register;proto.render=render;proto._runLayoutPasses=run;for(const [renderer,original]of originals)renderer.render=original;};
 const native=wordDocument(pages);const report={profile:{pages,paragraphs:pages*8,explicitGroups:true},events,observer:{surface:'.w-surface',sheet:'.w-sheet',paragraph:'.w-paragraph'},qualification:'diagnostic only; instrumentation and optional forced render are not production/performance acceptance'};
 trace('schema-admission-start');try{assertWordNativeDocument(native);report.schemaAdmission='PASS';trace('schema-admission-pass');}catch(error){report.schemaAdmission='FAIL';report.schemaError=String(error);trace('schema-admission-fail',{error:String(error)});}
 delete window.wordLayout;trace('mount-start');const runtime=mountWordRuntime(document.getElementById('host'),{initialDocument:native,editable:true,debug:true});runtimeRef.current=runtime;trace('mount-returned',dom());
 const ready=async(ms)=>{const end=performance.now()+ms;while(performance.now()<end){await new Promise(r=>requestAnimationFrame(r));if(completeCount>0&&document.querySelector('.w-surface')){await new Promise(r=>requestAnimationFrame(r));return true;}}return false;};
 report.contentCompleted=await ready(2000);
 const snapshot=()=>({rootId:runtime.editor.getRootId(),rootDomId:document.querySelector('.w-document')?.getAttribute('data-bc-sid'),documentFaults:runtime.editor.documentFaults,
   modelSurfaces:runtime.editor.exportDocument().content?.filter(n=>n.stype==='surface').map(n=>({id:n.sid,children:n.content?.length,modelType:runtime.editor.dataStore.getNode(n.sid)?.stype})),
   ...dom(),layout:window.wordLayout?[...window.wordLayout].map(([id,l])=>({id,pages:l.pages.length,totalHeight:l.totalHeight})):null});
 report.normal=snapshot();trace('normal-observation',dom());
 if(afterCommitRender&&report.normal.sheets===0&&report.normal.surfaces.length>0){trace('controlled-post-commit-render-start');runtime.view.render(undefined,{sync:true});await ready(2000);report.afterControlledRender=snapshot();trace('controlled-post-commit-render-end',dom());}
 const walker=document.createTreeWalker(document.querySelector('.w-paragraph')??document.body,NodeFilter.SHOW_TEXT);let text;
 while((text=walker.nextNode()))if(text.textContent.trim()){text.parentElement.setAttribute('data-m0-font-target','true');report.fontTarget={selector:'[data-m0-font-target="true"]',tag:text.parentElement.tagName,className:text.parentElement.className,textSample:text.textContent.slice(0,60),computedFontFamily:getComputedStyle(text.parentElement).fontFamily,fontSize:getComputedStyle(text.parentElement).fontSize};break;}
 return report;
};
window.m0DiagnosticDispose=()=>cleanup();
