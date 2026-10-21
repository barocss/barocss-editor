import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from '../../src/native2-scenario-fixtures';
import type { Native2EditableTargetObservation } from '../../src/native2-editable-target-scenario';
type Fixture = typeof NATIVE_NOTE_FIXTURES[keyof typeof NATIVE_NOTE_FIXTURES];
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const docA = '33333333-3333-4333-8333-333333333333', docB = '44444444-4444-4444-8444-444444444444';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const raw = (f: Fixture) => JSON.stringify(f);
const targetRaw = (f: Fixture) => JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: f.schemaBundle, document: f.document, ...('savedAt' in f ? { savedAt: f.savedAt } : {}) }, null, 2) + '\n';
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function expectedEngine(value: unknown, root = false, path = '', addedPrefix?: string): Record<string, unknown> {
  if (!isRecord(value) || typeof value.stype !== 'string') throw new Error('Independent original node required');
  if (addedPrefix && path.startsWith(addedPrefix)) return { ...value,
    ...(Array.isArray(value.content) ? { content: value.content.map((child, i) => expectedEngine(child, false, `${path}/${i}`, addedPrefix)) } : {}) };
  const metadata = isRecord(value.metadata) ? { ...value.metadata } : {}; delete metadata.loadedAt;
  return { stype: value.stype, attributes: value.attributes ?? {}, metadata,
    ...(Object.hasOwn(value, 'text') ? { text: value.text } : {}), ...(Object.hasOwn(value, 'marks') ? { marks: value.marks } : {}),
    ...(Array.isArray(value.content) && (value.content.length || root) ? { content: value.content.map((child, i) => expectedEngine(child, false, `${path}/${i}`, addedPrefix)) } : {}) };
}
function observedEngine(value: unknown, ids = new Set<string>(), path = '', addedPrefix?: string): Record<string, unknown> {
  if (!isRecord(value) || typeof value.sid !== 'string' || !value.sid || ids.has(value.sid)) throw new Error('Every real unique SID required');
  ids.add(value.sid); const node = { ...value }; delete node.sid;
  for (const key of ['text', 'marks', 'content']) if (Object.hasOwn(node, key) && node[key] === undefined) delete node[key];
  if (addedPrefix && path.startsWith(addedPrefix)) {
    // addChild persists authored values without Loader's default attributes or generated loadedAt.
    for (const key of ['attributes', 'metadata']) if (Object.hasOwn(node, key) && node[key] === undefined) delete node[key];
  } else {
    if (!isRecord(node.metadata)) throw new Error('Actual loader metadata required');
    expect(node.metadata.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); const metadata = { ...node.metadata }; delete metadata.loadedAt; node.metadata = metadata;
  }
  if (Array.isArray(node.content)) node.content = node.content.map((child, i) => observedEngine(child, ids, `${path}/${i}`, addedPrefix)); return node;
}
async function read(page: Page): Promise<Native2EditableTargetObservation> {
  return page.evaluate(() => { const v = window.readNative2EditableTarget?.(); if (!v) throw new Error('Actual native preserve not ready'); return v; });
}
function assertPositiveRange(v: Native2EditableTargetObservation, text: string, startOffset: number, endOffset: number) {
  const selection = v.selection, range = v.domRange;
  if (!selection || selection.type !== 'range' || !range) throw new Error('Real noncollapsed engine and DOM ranges required');
  expect(selection).toMatchObject({ startOffset, endOffset, collapsed: false, direction: 'forward' });
  expect(range).toMatchObject({ startOffset, endOffset, collapsed: false, text: text.slice(startOffset, endOffset) });
  expect(selection.startNodeId).toBe(selection.endNodeId); expect(selection.startNodeId).toBe(range.startNodeId);
  expect(range.startNodeId).toBe(range.endNodeId); expect(range.startNodeId).toBeTruthy(); expect(v.hostFocused).toBe(true);
  const matches: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (!isRecord(node)) throw new Error('Whole actual model node required');
    if (node.sid === selection.startNodeId) matches.push(node);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(v.model); expect(matches).toHaveLength(1); expect(matches[0]).toMatchObject({ stype: 'inline-text', text });
}
async function full(page: Page, expected: Fixture, addedPrefix?: string) {
  const v = await read(page); expect(v.nativeDocument).toEqual(expected.document);
  expect(JSON.parse(v.snapshotText)).toEqual(expected); expect(observedEngine(v.model, new Set(), '', addedPrefix)).toEqual(expectedEngine(expected.document, true, '', addedPrefix)); return v;
}
// Independent whole-file expectations. Only these authored paths change; all other original JSON stays exact.
function edited(file: Fixture, path: Array<string | number>, text: string): Fixture {
  const next = structuredClone(file); let value: unknown = next;
  for (const segment of path) {
    if (typeof segment === 'number' && Array.isArray(value)) value = value[segment];
    else if (typeof segment === 'string' && isRecord(value)) value = value[segment];
    else throw new Error('Independent declared native path required');
  }
  if (!isRecord(value) || value.stype !== 'inline-text' || typeof value.text !== 'string') throw new Error('Declared text leaf required');
  value.text = text; return next;
}
const seed = edited(NATIVE_NOTE_FIXTURES.TARGET_A2, ['document','content',0,'content',0], '목표 A • 독립 편집');
const newRoot = edited(seed, ['document','content',0,'content',0], '목표 A • 독립 편집 • 새 대상');
const later = edited(newRoot, ['document','content',4,'content',1,'content',0,'content',0], '항목 본문 A / 새 대상 중첩 입력');
function controlled() {
  const original = NATIVE_NOTE_FIXTURES.SOURCE_A, originalB = NATIVE_NOTE_FIXTURES.SOURCE_B;
  const head = (documentId: string, file: Fixture, title: string) => ({ documentId, tenantId, workspaceId, product: 'note', title,
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: file.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: hash(raw(file)) });
  const a = head(docA, original, 'SOURCE_A'), b = head(docB, originalB, 'SOURCE_B');
  const pin = (file: Fixture) => hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1',tenantId,workspaceId,docA,'pinned',file.schemaBundle.selected.map(r=>[r.schemaId,r.version,r.digest])]));
  const adopted = targetRaw(seed), saved = targetRaw(newRoot);
  const adoptBody = {schemaAction:'adopt',expectedRevision:1,expectedSnapshotHash:a.snapshotHash,expectedPriorPinDigest:pin(original),snapshotText:adopted,idempotencyKey:'native2-adopt-test-1'};
  const saveBody = {schemaAction:'preserve',expectedRevision:2,expectedSnapshotHash:hash(adopted),expectedPriorPinDigest:pin(seed),snapshotText:saved,idempotencyKey:'native2-target-preserve-test-1'};
  const adoptReceipt = {operation:'update',idempotencyKey:adoptBody.idempotencyKey,requestHash:'f'.repeat(64),document:{...a,revision:2,snapshotHash:hash(adopted)},snapshotText:adopted};
  const saveReceipt = {operation:'update',idempotencyKey:saveBody.idempotencyKey,requestHash:'d'.repeat(64),document:{...a,revision:3,snapshotHash:hash(saved)},snapshotText:saved};
  const entries = seed.schemaBundle.definitions.map(e=>({...e.reference,digestAlgorithm:REGISTRY_DIGEST,definitionText:e.definitionText,...parseRegistryDefinition(e.definitionText),actorIdentityId:'66666666-6666-4666-8666-666666666666',createdAt:'2026-10-01T00:00:00.000Z'}));
  let adoptedOnce=false,savedOnce=false,effects=0,holdReceipt=false,holdSave=false,loseSave=false,holdFresh=false,freshReads=0;
  let receiptEntered!:()=>void,receiptRelease!:()=>void,saveEntered!:()=>void,saveRelease!:()=>void,freshEntered!:()=>void,freshRelease!:()=>void;
  const receiptPoint=new Promise<void>(r=>receiptEntered=r),receiptGate=new Promise<void>(r=>receiptRelease=r);
  const savePoint=new Promise<void>(r=>saveEntered=r),saveGate=new Promise<void>(r=>saveRelease=r);
  const freshPoint=new Promise<void>(r=>freshEntered=r),freshGate=new Promise<void>(r=>freshRelease=r);
  const calls:Array<{method:string;url:string;body:string|null}>=[];
  const install=(page:Page)=>page.route('**/controlled-native2/**',async route=>{
    const request=route.request(),method=request.method(),url=request.url();calls.push({method,url,body:request.postData()});
    if(url.includes('/schemas/')) return route.fulfill({json:{record:entries[3],dependencies:[entries[1],entries[0],entries[2]]}});
    if(method==='PUT'){
      const target=request.postData()?.includes('native2-target-preserve-test-1');
      expect(request.postData()).toBe(JSON.stringify(target?saveBody:adoptBody));
      if(target){if(!savedOnce){savedOnce=true;effects++;}if(holdSave){saveEntered();await saveGate;}if(loseSave){loseSave=false;return route.abort('failed');}}
      else if(!adoptedOnce){adoptedOnce=true;effects++;}
      return route.fulfill({json:target?saveReceipt:adoptReceipt});
    }
    expect(method).toBe('GET');expect(request.postData()).toBeNull();
    if(url.includes('/receipts/')){if(holdReceipt){receiptEntered();await receiptGate;}return route.fulfill({json:url.includes('native2-target-preserve-test-1')?saveReceipt:adoptReceipt});}
    const isB=url.includes(docB),file=isB?originalB:savedOnce?newRoot:adoptedOnce?seed:original;
    const h=isB?b:savedOnce?saveReceipt.document:adoptedOnce?adoptReceipt.document:a,text=isB?raw(originalB):savedOnce?saved:adoptedOnce?adopted:raw(original);
    if(holdFresh&&!url.endsWith('/schema-bundle')&&!isB){freshReads++;if(freshReads===2){freshEntered();await freshGate;}}
    return route.fulfill({json:url.endsWith('/schema-bundle')?{status:'pinned',documentId:h.documentId,documentRevision:h.revision,snapshotHash:h.snapshotHash,nativeFormat:{format:'barocss-note',version:2},bundle:file.schemaBundle}:{document:h,snapshotText:text}});
  });
  return {install,calls,adoptBody,saveBody,effects:()=>effects,receiptPoint,savePoint,freshPoint,
    holdReceipt:()=>{holdReceipt=true;},releaseReceipt:()=>receiptRelease(),holdSave:()=>{holdSave=true;loseSave=true;},releaseSave:()=>saveRelease(),holdFresh:()=>{holdFresh=true;},releaseFresh:()=>freshRelease()};
}
async function open(page:Page,store:ReturnType<typeof controlled>){await store.install(page);await page.goto('/scenarios.html?case=native2-editable-target-A');await expect(page.getByTestId('native2-editable-target-host').locator('.on-doc')).toBeVisible();await full(page,NATIVE_NOTE_FIXTURES.SOURCE_A);}
async function adopt(page:Page){
  await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('End');await page.keyboard.insertText(' • 독립 편집');
  await page.getByRole('button',{name:'Prepare exact schema 111 v2',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('exact-version-prepared-source-protected');
  await page.getByRole('button',{name:'Adopt fixed target',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('adoption-fixed-confirmed-source-session-retained');
  await full(page,NATIVE_NOTE_EXPECTED_VARIANTS.typing);
}
async function begin(page:Page){await page.getByRole('button',{name:'Begin target editing',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('target-active-old-history-parked');return full(page,seed);}
async function nested(page:Page){await page.getByRole('button',{name:'Show last nested resource',exact:true}).click();await page.getByTestId('native2-editable-target-host').locator('p').filter({hasText:'항목 본문 A'}).first().click();await page.keyboard.press('End');await page.keyboard.insertText(' / 새 대상 중첩 입력');await page.getByRole('button',{name:'Protect latest draft',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('latest-draft-protected');}
test.afterEach(async({page},info)=>{await page.screenshot({path:info.outputPath('actual-protected-target.png'),fullPage:true});const v=await page.evaluate(()=>window.readNative2EditableTarget?.());if(v)await info.attach('whole-protected-target.json',{body:JSON.stringify(v,null,2),contentType:'application/json'});});
test('held operated source range and whole old history are parked; fresh target caret12 and separate explicit save with late nested draft, GET-only unknown and exact retry',async({page},info)=>{
  const store=controlled();await open(page,store);await adopt(page);store.holdReceipt();
  await page.getByRole('button',{name:'Begin target editing',exact:true}).click();await store.receiptPoint;
  await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('Home');for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
  await expect.poll(async()=>(await read(page)).selection).toMatchObject({startOffset:3,endOffset:4,collapsed:false});
  const held=await full(page,NATIVE_NOTE_EXPECTED_VARIANTS.typing);assertPositiveRange(held,'목표 A • 독립 편집',3,4);expect(held.history.totalEntries).toBeGreaterThan(0);
  await info.attach('whole-held-old-positive.json',{body:JSON.stringify(held,null,2),contentType:'application/json'});
  store.releaseReceipt();await expect(page.getByTestId('target-status')).toHaveText('target-active-old-history-parked');
  await expect.poll(async()=>(await read(page)).domRange).toMatchObject({startOffset:12,endOffset:12,collapsed:true});
  const fresh=await full(page,seed);expect(fresh.sourceRetired).toBe(true);expect(fresh.parkedHistoryRetained).toBe(true);expect(fresh.sourceModel).toEqual(held.model);expect(fresh.sourceNative).toEqual(held.nativeDocument);expect(fresh.sourceHistory).toEqual(held.history);expect(fresh.sourceEpoch).toBe(held.epoch);expect(fresh.sourceContext).toEqual(held.sourceContext);expect(fresh.history).toEqual({totalEntries:0,currentIndex:-1,canUndo:false,canRedo:false});
  if(fresh.selection?.type!=='range'||!fresh.domRange)throw new Error('Fresh positive caret required');
  expect(fresh.selection).toMatchObject({startOffset:12,endOffset:12,collapsed:true});expect(fresh.domRange).toMatchObject({startOffset:12,endOffset:12,collapsed:true,text:''});
  expect(fresh.selection.startNodeId).toBe(fresh.selection.endNodeId);expect(fresh.selection.startNodeId).toBe(fresh.domRange.startNodeId);expect(fresh.domRange.startNodeId).toBe(fresh.domRange.endNodeId);expect(fresh.selection.startNodeId).not.toBe(held.domRange?.startNodeId);expect(fresh.hostFocused).toBe(true);
  const matches:Array<Record<string,unknown>>=[];const visit=(node:unknown)=>{if(!isRecord(node))throw new Error('Whole actual fresh model required');if(node.sid===fresh.selection?.startNodeId)matches.push(node);if(Array.isArray(node.content))node.content.forEach(visit);};visit(fresh.model);expect(matches).toHaveLength(1);expect(matches[0]).toMatchObject({stype:'inline-text',text:'목표 A • 독립 편집'});
  await info.attach('whole-fresh-target-positive.json',{body:JSON.stringify(fresh,null,2),contentType:'application/json'});
  const oldRaw=fresh.durableRaw;await page.getByRole('button',{name:'Probe retired source callback',exact:true}).click();await expect(page.getByTestId('target-error')).toHaveText('stale_native2_writable_context');expect((await read(page)).durableRaw).toBe(oldRaw);
  await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('End');await page.keyboard.insertText(' • 새 대상');await full(page,newRoot);
  await page.getByRole('button',{name:'Undo local edit',exact:true}).click();await full(page,seed);await page.getByRole('button',{name:'Redo local edit',exact:true}).click();await full(page,newRoot);
  store.holdSave();await page.getByRole('button',{name:'Save target change',exact:true}).click();await store.savePoint;
  await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('Home');for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
  await expect.poll(async()=>(await read(page)).selection).toMatchObject({startOffset:3,endOffset:4,collapsed:false});
  const pendingTarget=await full(page,newRoot);assertPositiveRange(pendingTarget,'목표 A • 독립 편집 • 새 대상',3,4);await info.attach('whole-pending-target-before-retired-origin.json',{body:JSON.stringify(pendingTarget,null,2),contentType:'application/json'});
  await page.getByRole('button',{name:'Probe retired source callback',exact:true}).click();await expect(page.getByTestId('target-error')).toHaveText('stale_native2_writable_context');const pendingAfter=await full(page,newRoot);assertPositiveRange(pendingAfter,'목표 A • 독립 편집 • 새 대상',3,4);expect(pendingAfter.model).toEqual(pendingTarget.model);expect(pendingAfter.history).toEqual(pendingTarget.history);expect(pendingAfter.domRange).toEqual(pendingTarget.domRange);expect(pendingAfter.targetRaw).toBe(pendingTarget.targetRaw);expect(pendingAfter.sourceModel).toEqual(held.model);expect(pendingAfter.sourceContext).toEqual(held.sourceContext);await info.attach('whole-pending-target-after-retired-origin.json',{body:JSON.stringify(pendingAfter,null,2),contentType:'application/json'});
  const fixed=await read(page);expect(fixed.targetRecovery?.fixed?.bodyText).toBe(JSON.stringify(store.saveBody));expect(fixed.targetRecovery?.fixed?.generation).toBe(2);expect(fixed.durableRaw).toBe(oldRaw);
  await nested(page);const dirty=await full(page,later,'/4/1/');expect(dirty.targetRecovery?.latestDraft.generation).toBe(3);expect(dirty.targetRecovery?.fixed).toEqual(fixed.targetRecovery?.fixed);
  store.releaseSave();await expect(page.getByTestId('target-status')).toHaveText('target-unknown-or-unprotected');
  await page.getByRole('button',{name:'Check target receipt',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('receipt_not_correlated');expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(2);
  await page.getByRole('button',{name:'Retry target fixed request',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('target-fixed-confirmed-later-dirty');
  const after=await full(page,later,'/4/1/');expect(after.targetRecovery?.fixed).toEqual(fixed.targetRecovery?.fixed);expect(after.targetRecovery?.latestDraft.snapshotText).toBe(dirty.targetRecovery?.latestDraft.snapshotText);expect(after.sourceModel).toEqual(held.model);expect(after.sourceHistory).toEqual(held.history);expect(after.parkedHistoryRetained).toBe(true);expect(after.durableRaw).toBe(oldRaw);expect(store.effects()).toBe(2);expect(store.calls.filter(c=>c.method==='PUT').map(c=>c.body)).toEqual([JSON.stringify(store.adoptBody),JSON.stringify(store.saveBody),JSON.stringify(store.saveBody)]);
  await info.attach('whole-current-target-late-draft.json',{body:JSON.stringify(after,null,2),contentType:'application/json'});
  await page.getByRole('button',{name:'Leave protected and open target read-only',exact:true}).click();await expect(page).toHaveURL(/case=native2-transport-A2$/);await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible();
  const reopened=await page.evaluate(()=>window.readNative2Transport?.());expect(reopened?.nativeDocument).toEqual(newRoot.document);expect(reopened?.snapshotText).toBe(targetRaw(newRoot));
  const retained=await page.evaluate(key=>localStorage.getItem(key),after.targetKey!);expect(JSON.parse(retained!).latestDraft.snapshotText).toBe(dirty.targetRecovery?.latestDraft.snapshotText);
  await page.reload();await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible();const reloaded=await page.evaluate(()=>window.readNative2Transport?.());expect(reloaded?.nativeDocument).toEqual(newRoot.document);expect(reloaded?.snapshotText).toBe(targetRaw(newRoot));expect(await page.evaluate(key=>localStorage.getItem(key),after.targetKey!)).toBe(retained);expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(3);await info.attach('whole-readonly-reloaded-target.json',{body:JSON.stringify(reloaded,null,2),contentType:'application/json'});
  await page.goto('/scenarios.html?case=native2-transport-B');await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible();const b=await page.evaluate(()=>window.readNative2Transport?.());expect(b?.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_B.document);expect(b?.snapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));expect(observedEngine(b?.model)).toEqual(expectedEngine(NATIVE_NOTE_FIXTURES.SOURCE_B.document,true));
});
test('divergent last source input blocks handoff before retirement; whole old model/history/raw remain editable',async({page})=>{
  const store=controlled();await open(page,store);await adopt(page);await nested(page);const before=await read(page);
  await page.getByRole('button',{name:'Begin target editing',exact:true}).click();await expect(page.getByTestId('target-error')).toHaveText('native2_source_diverged_or_unconfirmed');const after=await read(page);
  expect(after.sourceRetired).toBe(false);expect(after.writable).toBe(true);expect(after.model).toEqual(before.model);expect(after.history).toEqual(before.history);expect(after.durableRaw).toBe(before.durableRaw);expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
});
test('role revoked during separate postretirement read creates no editing owner or storage effect',async({page})=>{
  const store=controlled();await open(page,store);await adopt(page);const before=await read(page);store.holdFresh();await page.getByRole('button',{name:'Begin target editing',exact:true}).click();await store.freshPoint;
  await page.getByRole('button',{name:'Revoke controlled role',exact:true}).click();store.releaseFresh();await expect(page.getByTestId('target-status')).toHaveText('blocked-after-retirement-no-editingowner');const after=await read(page);
  expect(after.writable).toBe(false);expect(after.sourceRetired).toBe(true);expect(after.model).toEqual(before.model);expect(after.nativeDocument).toEqual(before.nativeDocument);expect(after.history).toEqual(before.history);expect(after.durableRaw).toBe(before.durableRaw);expect(after.parkedHistoryRetained).toBe(true);expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
});
test('target BIUS and structural edits undo exactly; quota blocks clean exit without source mutations or hidden PUT',async({page})=>{
  const store=controlled();await open(page,store);await adopt(page);await begin(page);
  await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('Home');await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
  for(const name of ['toggleBold','toggleItalic','toggleUnderline','toggleStrikeThrough']){const before=await read(page);await page.getByRole('button',{name,exact:true}).click();await expect.poll(async()=>(await read(page)).nativeDocument).not.toEqual(before.nativeDocument);await page.getByRole('button',{name:'Undo local edit',exact:true}).click();await full(page,seed);}
  await page.getByRole('button',{name:'Move first block down',exact:true}).click();const moved=await read(page);expect(moved.nativeDocument.content[1]).toEqual(seed.document.content[0]);await page.getByRole('button',{name:'Undo local edit',exact:true}).click();await full(page,seed);
  const before=await read(page);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('controlled quota','QuotaExceededError');};});await page.getByRole('button',{name:'Leave after protecting input',exact:true}).click();await expect(page.getByTestId('target-status')).toHaveText('leave-blocked-input-unprotected');const after=await read(page);expect(after.writable).toBe(true);expect(after.model).toEqual(before.model);expect(after.sourceModel).toEqual(before.sourceModel);expect(after.parkedHistoryRetained).toBe(true);expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
});

test('new target role retirement during held explicit PUT retains whole target/source history/raw and refuses late receipt acknowledgement',async({page},info)=>{
  const store=controlled();await open(page,store);await adopt(page);await begin(page);await page.getByTestId('native2-editable-target-host').locator('h2').click();await page.keyboard.press('End');await page.keyboard.insertText(' • 새 대상');store.holdSave();await page.getByRole('button',{name:'Save target change',exact:true}).click();await store.savePoint;const before=await full(page,newRoot);
  await info.attach('whole-new-owner-before-retirement.json',{body:JSON.stringify(before,null,2),contentType:'application/json'});
  await page.getByRole('button',{name:'Revoke controlled role',exact:true}).click();store.releaseSave();await expect(page.getByTestId('target-status')).toHaveText('target-unknown-or-unprotected');await expect(page.getByTestId('target-error')).toHaveText('stale_native2_writable_context');const after=await full(page,newRoot);
  expect(after.writable).toBe(false);expect(after.model).toEqual(before.model);expect(after.history).toEqual(before.history);expect(after.sourceModel).toEqual(before.sourceModel);expect(after.sourceContext).toEqual(before.sourceContext);expect(after.sourceHistory).toEqual(before.sourceHistory);expect(after.targetRaw).toBe(before.targetRaw);expect(after.durableRaw).toBe(before.durableRaw);expect(after.targetRecovery?.phase).toBe('pending');expect(after.parkedHistoryRetained).toBe(true);expect(store.calls.filter(c=>c.method==='PUT')).toHaveLength(2);
  await info.attach('whole-new-owner-after-retirement.json',{body:JSON.stringify(after,null,2),contentType:'application/json'});
});
