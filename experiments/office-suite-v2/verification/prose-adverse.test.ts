import test from 'node:test';
import assert from 'node:assert/strict';
import { ProseReplica } from '../src/prose.ts';

function pair() {
 const a=new ProseReplica('same-user-tab-A');a.insert(0,'abcd');
 const b=new ProseReplica('same-user-tab-B',a.exportUpdate());
 return {a,b,close(){a.destroy();b.destroy();}};
}
function sync(a:ProseReplica,b:ProseReplica){const aa=a.exportUpdate(),bb=b.exportUpdate();a.receive(bb);b.receive(aa);assert.equal(a.text,b.text);assert.deepEqual(a.runs,b.runs);}

test('concurrent same-offset inserts converge; local undo preserves the other tab',()=>{
 const p=pair();try{p.a.insert(2,'A');p.b.insert(2,'B');sync(p.a,p.b);assert.ok(p.a.text.includes('A')&&p.a.text.includes('B'));
 assert.equal(p.a.undo(),true);sync(p.a,p.b);assert.equal(p.a.text,'abBcd');
 assert.equal(p.a.redo(),true);sync(p.a,p.b);assert.equal(p.a.text.length,6);
 }finally{p.close();}
});
test('remote formatting and text survive split undo and explicit join',()=>{
 const p=pair();try{p.a.mark(0,1,'bold',true);p.b.mark(3,1,'italic',true);sync(p.a,p.b);
 assert.equal(p.a.undo(),true);sync(p.a,p.b);assert.ok(p.a.runs.some(r=>r.attributes?.italic));assert.ok(!p.a.runs.some(r=>r.attributes?.bold));
 p.a.split(2);p.b.insert(2,'remote');sync(p.a,p.b);assert.equal(p.a.paragraphs.length,2);
 assert.equal(p.a.undo(),true);sync(p.a,p.b);assert.equal(p.a.paragraphs.length,1);assert.ok(p.a.text.includes('remote'));
 p.a.split(1);sync(p.a,p.b);p.b.join(1);sync(p.a,p.b);assert.equal(p.a.paragraphs.length,1);
 }finally{p.close();}
});
test('fresh reload has no old session undo; relative anchor follows remote insertion',()=>{
 const p=pair();let reload:ProseReplica|undefined;try{const anchor=p.a.anchor(2);p.b.insert(0,'앞');p.a.receive(p.b.exportUpdate());assert.equal(p.a.resolve(anchor),3);
 reload=new ProseReplica('fresh-session',p.a.exportUpdate());assert.equal(reload.undo(),false);assert.equal(reload.text,p.a.text);
 }finally{reload?.destroy();p.close();}
});
test('unsupported paragraph operations and malformed ranges refuse without content mutation',()=>{
 const p=pair();try{const before=p.a.exportUpdate();assert.throws(()=>p.a.moveParagraph(),/unsupported/);assert.throws(()=>p.a.deleteParagraph(),/unsupported/);
 assert.throws(()=>p.a.join(0),/not-paragraph-boundary/);assert.throws(()=>p.a.insert(-1,'x'),/invalid-text-range/);assert.throws(()=>p.a.insert(0,'\r'),/prose-input-limit/);
 assert.deepEqual(p.a.exportUpdate(),before);
 }finally{p.close();}
});
