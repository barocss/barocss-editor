import {expect,it} from 'vitest';
import {createBusinessPair,readBusinessPair,BUSINESS_PAIR_KEY} from '../src/business-pair';
import {createFieldResolver} from '../../office-text/src/field-resolver';
import {createNumberingResolver} from '../../office-text/src/numbering-resolver';
import {readWordFile,wordFileText} from '../src/word-file';
type Node={stype:string;sid?:string;attributes?:Record<string,unknown>;text?:string;content?:Node[];marks?:{stype:string;range:[number,number];attrs?:Record<string,unknown>}[];metadata?:Record<string,unknown>};
function document():Node{return {stype:'document',content:[{stype:'surface',content:[
 {stype:'paragraph',attributes:{numId:'example',numLevel:0},content:[{stype:'inline-text',text:'An earlier fictional item.'}]},
 {stype:'paragraph',attributes:{numId:'example',numLevel:0},content:[{stype:'bookmarkAnchor',attributes:{id:'requirement'}},{stype:'inline-text',text:'Retain the fictional requirement.'}]},
 {stype:'paragraph',content:[{stype:'bookmarkAnchor',attributes:{id:'decision'}},{stype:'inline-text',text:'Preserve exact original references.'}]}
 ]},{stype:'resources',content:[{stype:'numberingDef',attributes:{id:'example'},content:[{stype:'numberingLevel',attributes:{level:0,format:'decimal',text:'%1.',start:1,suffix:'space'}}]}]}]};}
function number(doc:Node){
 const clone=structuredClone(doc),nodes=new Map<string,Node>();let count=0,target='';
 const walk=(node:Node)=>{node.sid=`probe-${count++}`;nodes.set(node.sid,node);if(node.stype==='paragraph'&&node.content?.some(child=>child.stype==='bookmarkAnchor'&&child.attributes?.id==='requirement'))target=node.sid;node.content?.forEach(walk);};walk(clone);
 const resolver=createNumberingResolver({rootId:clone.sid!,getNode:id=>nodes.get(id)});return resolver.numberFor(target)?.text;
}
function authored(){const d=document();d.metadata={[BUSINESS_PAIR_KEY]:createBusinessPair(d,'requirement','decision')};return d;}
it('control: full pinned native context retrieves the original list number',()=>{
 const d=authored(),read=readBusinessPair(d);expect(read.status).toBe('valid');if(read.status!=='valid')throw Error('invalid pair');
 expect(read.review).toBe('current');expect(number(d)).toBe('2.');const pin=readWordFile(read.payload.items[0].versions[0].snapshotText);if('error'in pin)throw Error(pin.error);expect(number(pin.document as Node)).toBe('2.');expect(wordFileText(d,'')).toContain('numberingDef');
});
it('requires re-review when earlier native list context changes the target number without changing its paragraph/resources',()=>{
 const d=authored(),before=structuredClone(d),original=readBusinessPair(d);if(original.status!=='valid')throw Error('invalid pair');
 const pin=original.payload.items[0].versions[0].snapshotText;
 d.content![0].content!.unshift({stype:'paragraph',attributes:{numId:'example',numLevel:0},content:[{stype:'inline-text',text:'A newly inserted earlier item.'}]});
 expect(number(before)).toBe('2.');expect(number(d)).toBe('3.');expect(d.content![0].content![2]).toStrictEqual(before.content![0].content![1]);expect(d.content![1]).toStrictEqual(before.content![1]);
 const result=readBusinessPair(d);expect(result.status).toBe('valid');if(result.status!=='valid')throw Error('invalid pair');expect(result.payload.items[0].versions[0].snapshotText).toBe(pin);expect(result.review).toBe('needed');
});

function fieldText(doc:Node){
 const clone=structuredClone(doc),nodes=new Map<string,Node>();let count=0;
 const walk=(node:Node)=>{node.sid=`field-${count++}`;nodes.set(node.sid,node);node.content?.forEach(walk);};walk(clone);
 return createFieldResolver({rootId:clone.sid!,getNode:id=>nodes.get(id)}).reference('evidence','text');
}
it('requires re-review when a native referenced bookmark changes the effective requirement text',()=>{
 const d=document();d.content![0].content![0]={stype:'paragraph',content:[{stype:'inline-text',text:'Alpha policy.',marks:[{stype:'bookmark',range:[0,13],attrs:{name:'evidence'}}]}] } as Node;
 const target=d.content![0].content![1];target.attributes={};target.content=[{stype:'bookmarkAnchor',attributes:{id:'requirement'}},{stype:'inline-text',text:'Based on '},{stype:'fieldRef',attributes:{targetId:'evidence',format:'text'}}];
 d.metadata={[BUSINESS_PAIR_KEY]:createBusinessPair(d,'requirement','decision')};const before=structuredClone(d),initial=readBusinessPair(d);expect(initial.status).toBe('valid');if(initial.status!=='valid')throw Error('invalid pair');
 const pin=initial.payload.items[0].versions[0].snapshotText;expect(fieldText(d)).toBe('Alpha policy.');
 d.content![0].content![0].content![0].text='Bravo policy.';expect(fieldText(d)).toBe('Bravo policy.');expect(target).toStrictEqual(before.content![0].content![1]);expect(d.content![1]).toStrictEqual(before.content![1]);
 const historical=readWordFile(pin);if('error'in historical)throw Error(historical.error);expect(fieldText(historical.document as Node)).toBe('Alpha policy.');
 const result=readBusinessPair(d);expect(result.status).toBe('valid');if(result.status!=='valid')throw Error('invalid pair');expect(result.payload.relations).toStrictEqual(initial.payload.relations);expect(result.payload.items[0].versions[0].snapshotText).toBe(pin);expect(result.review).toBe('needed');
});
