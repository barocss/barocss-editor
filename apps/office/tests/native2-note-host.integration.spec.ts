import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { openNoteTree, noteTreeOf } from '../../../packages/office-note/src/session';
import { serializeNoteFile } from '../../../packages/office-note/src/note-file-codec';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';

// Controlled transport; the mounted authenticated host and every Note editor are real.
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '00000000-0000-4000-8000-000000000003';
const pageId = '00000000-0000-4000-8000-000000000005';
const fixture = { stype: 'note' as const, attributes: { title: 'Alpha Note', pageId }, content: [
  { stype: 'paragraph', attributes: { retained: 'parent-block' }, content: [{ stype: 'inline-text', text: 'Parent remains intact', marks: [{ type: 'italic' }] }] },
  { stype: 'noteDatabase', attributes: { source: 'tasks' } },
  { stype: 'resources', content: [
    { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Title', kind: 'text' }], records: [{ Title: 'Task' }], rowIds: ['task-row'] } },
    { stype: 'richText', attributes: { id: 'task-row', retained: 'body' }, content: [{ stype: 'paragraph', attributes: { retained: 'deep-block' }, content: [{ stype: 'inline-text', text: 'Nested target', marks: [] }] }] }
  ] }
] };
const session = openNoteTree(fixture);
let snapshotText: string;
try { snapshotText = serializeNoteFile({ ...fixture, content: noteTreeOf(session.editor.dataStore, session.rootId)!.content as unknown[] }); }
finally { session.close(); }
const documentHead = { documentId, tenantId: id, workspaceId, product: 'note', title: 'Alpha Note', metadataRevision: 1, mode: 'snapshot', revision: 1, pageId,
  documentKey: `wonffice-${id}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 1, snapshotHash: createHash('sha256').update(snapshotText).digest('hex') };
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const officeOrigin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5193'}`;
type Role = 'owner' | 'admin' | 'editor' | 'viewer';

async function mockLogin(page: Page, options: { role?: Role; tenants?: number; apiStatus?: number; accessStatus?: number; operatorStatus?: number; workspaceCount?: number; workspacesStatus?: number; documentCount?: number; documentsStatus?: number; openStatus?: number; openWorkspace?: string } = {}) {
  const { role = 'editor', tenants = 1, apiStatus = 200, accessStatus = 200,
    operatorStatus = 403, workspaceCount = 1, workspacesStatus = 200, documentCount = 0, documentsStatus = 200,
    openStatus = 200, openWorkspace = workspaceId } = options;
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, end_session_endpoint: `${issuer}/protocol/openid-connect/logout` }),
  }));
  await page.route(`${issuer}/protocol/openid-connect/auth**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/auth/callback?code=synthetic&state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/logout**`, route => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${officeOrigin}/?state=${encodeURIComponent(state ?? '')}')</script>` });
  });
  await page.route(`${issuer}/protocol/openid-connect/token`, route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 300 }),
  }));
  await page.route('**/api/v1/me', route => route.fulfill({
    status: apiStatus, contentType: 'application/json',
    body: JSON.stringify(apiStatus === 200 ? { issuer, subject: 'synthetic-user', currentUserId: '44444444-4444-4444-8444-444444444444', tenants: tenants ? [{ tenantId: id, name: 'Alpha Company', role }] : [], nextCursor: null } : { status: 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/access`, route => route.fulfill({ status: accessStatus, contentType: 'application/json', body: JSON.stringify(accessStatus === 200 ? { tenantId: id, role } : { status: 'forbidden' }) }));
  await page.route(`**/api/v1/tenants/${id}/workspaces**`, route => route.fulfill({
    status: workspacesStatus, contentType: 'application/json',
    body: JSON.stringify(workspacesStatus === 200
      ? { workspaces: workspaceCount ? [{ id: workspaceId, name: 'Alpha Workspace' }] : [], nextCursor: null }
      : { status: workspacesStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/projects?**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ projects: [], nextCursor: null }) }));
  // Exact item discovery must verify project absence; list absence is not enough.
  await page.route(`**/api/v1/tenants/${id}/projects/*`, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => route.fulfill({
    status: documentsStatus, contentType: 'application/json',
    body: JSON.stringify(documentsStatus === 200
      ? { documents: Array.from({ length: documentCount }, () => documentHead), nextCursor: null }
      : { status: documentsStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`, route => route.fulfill({
    status: openStatus, contentType: 'application/json', body: JSON.stringify(openStatus === 200
      ? { document: { ...documentHead, workspaceId: openWorkspace }, snapshotText }
      : { status: openStatus === 403 ? 'forbidden' : 'service_unavailable' }),
  }));
  await page.route('**/api/v1/operator/access', route => route.fulfill({ status: operatorStatus, contentType: 'application/json', body: JSON.stringify(operatorStatus === 200 ? { operator: true } : { status: operatorStatus === 403 ? 'forbidden' : 'service_unavailable' }) }));
}



// Real Office/Note host, controlled API and login. This does not prove genuine OIDC/PG.
const targetId = '33333333-3333-4333-8333-333333333333';
const nativePath = `/api/v1/tenants/${id}/note-native2/documents/${targetId}`;
async function openActualHost(page: Page, target: typeof NATIVE_NOTE_FIXTURES.SOURCE_B | typeof NATIVE_NOTE_FIXTURES.TARGET_A2) {
  const calls: string[] = [], writes: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && ['POST','PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.method()+' '+request.url());
  });
  let stored={document:{...documentHead},snapshotText};
  await mockLogin(page,{documentCount:1});
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}`,route=>route.fulfill({contentType:'application/json',body:JSON.stringify(stored)}));
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`,route=>{
    expect(route.request().method()).toBe('PUT');const body=route.request().postDataJSON();expect(body.expectedRevision).toBe(stored.document.revision);
    stored={document:{...stored.document,revision:body.expectedRevision+1,snapshotHash:createHash('sha256').update(body.snapshotText).digest('hex')},snapshotText:body.snapshotText};
    return route.fulfill({contentType:'application/json',body:JSON.stringify({operation:'update',idempotencyKey:body.idempotencyKey,requestHash:createHash('sha256').update(JSON.stringify(['update',documentId,body.expectedRevision,body.snapshotText])).digest('hex'),...stored})});
  });
  // The authored target scope matches this test's real host scope, without changing its pins/body/raw.
  expect(target.schemaBundle.definitions.every(entry => {
    const scope=JSON.parse(entry.definitionText).scope;return scope.tenantId===id && scope.workspaceId===workspaceId;
  })).toBe(true);
  const raw=JSON.stringify(target),digest=createHash('sha256').update(raw).digest('hex');
  await page.route(`**${nativePath}`,route=>{
    calls.push(new URL(route.request().url()).pathname);expect(route.request().method()).toBe('GET');expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({document:{documentId:targetId,tenantId:id,workspaceId,product:'note',title:'Pinned target',creatorUserId:null,metadataRevision:1,mode:'snapshot',pageId:target.document.attributes.pageId,documentKey:`wonffice-${id}-${targetId}`,fileFormat:'barocss-note',fileVersion:2,revision:2,snapshotHash:digest},snapshotText:raw})});
  });
  await page.route(`**${nativePath}/schema-bundle`,route=>{
    calls.push(new URL(route.request().url()).pathname);expect(route.request().method()).toBe('GET');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'pinned',documentId:targetId,documentRevision:2,snapshotHash:digest,nativeFormat:{format:'barocss-note',version:2},bundle:target.schemaBundle})});
  });
  await page.goto(`/products/note/?tenant=${id}&workspace=${workspaceId}&document=${documentId}&product=note`);
  await page.getByRole('button',{name:'일반 사용자로 들어가기',exact:true}).click();
  const host=page.locator('[data-server-note-workspace]');
  await expect(host.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  await expect(host.locator('.nw-document .on-doc > p').first()).toHaveText('Parent remains intact');
  await page.getByRole('textbox',{name:'읽을 native2 문서 ID'}).fill(targetId);
  return {host,calls,writes};
}
// Independently materialized native fixture with the unchanged Loader's bookkeeping contract.
function assertWholeInitialModel(model: unknown, native: unknown, sessionId: string, start: number, end: number) {
  const seen=new Set<string>();let ordinal=0;
  const expected=(authored: unknown, actual: unknown): unknown=>{
    if(!authored||typeof authored!=='object'||!actual||typeof actual!=='object')throw new Error('whole node required');
    const source=authored as Record<string,unknown>,node=actual as Record<string,unknown>,metadata=node.metadata as Record<string,unknown>;
    const sid=node.sid;expect(typeof sid).toBe('string');if(typeof sid!=='string')throw new Error('generated SID required');expect(sid.startsWith(sessionId+':')).toBe(true);expect(/^[1-9][0-9]*$/.test(sid.slice(sessionId.length+1))).toBe(true);expect(seen.has(sid)).toBe(false);seen.add(sid);ordinal++;
    expect(typeof metadata.loadedAt).toBe('string');const time=Date.parse(String(metadata.loadedAt));expect(time).toBeGreaterThanOrEqual(start);expect(time).toBeLessThanOrEqual(end);expect(new Date(time).toISOString()).toBe(metadata.loadedAt);
    const authoredMetadata=source.metadata as Record<string,unknown>|undefined;
    const result={...source,sid,attributes:source.attributes??{},metadata:{...authoredMetadata,loadedAt:metadata.loadedAt}};
    if(Array.isArray(source.content)){
      expect(Array.isArray(node.content)).toBe(true);expect((node.content as unknown[]).length).toBe(source.content.length);
      Object.assign(result,{content:source.content.map((child,index)=>expected(child,(node.content as unknown[])[index]))});
    }
    return result;
  };
  expect(model).toEqual(expected(native,model));return ordinal;
}
// Test-only read access to existing React props/state. No editor or selection mutations.
async function holdSource(page: Page) {
  return page.locator('.nw-document [data-note-editor]').first().evaluateHandle(el=>{
    const inspect=(node: Element)=>{
      const key=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(!key)throw new Error('actual React fiber required');
      let fiber=Reflect.get(node,key),component;const states=[];
      for(let depth=0;fiber&&depth<128;depth++,fiber=fiber.return){
        const props=fiber.memoizedProps;
        if(!component&&props?.editor&&props.rootId===node.getAttribute('data-note-editor'))component=fiber;
        let hook=fiber.memoizedState;const seen=new Set();
        for(let index=0;hook&&index<1000&&!seen.has(hook);index++,hook=hook.next){seen.add(hook);if(hook.memoizedState)states.push(hook.memoizedState);}
      }
      if(!component)throw new Error('actual NoteEditor props required');
      const editor=component.memoizedProps.editor,rootId=component.memoizedProps.rootId;
      if(editor.getRootId()!==rootId)throw new Error('mounted engine root mismatch');
      const wrappers=[...new Set(states.filter(v=>v?.value?.editor===editor&&v.documentId))];
      const stages=[...new Set(states.filter(v=>v?.value?.session?.editor===editor&&typeof v.value.read?.snapshotText==='string'))];
      const opened=[...new Set(states.filter(v=>v?.note&&typeof v.confirmedText==='string'&&wrappers.some(w=>w.generation===v.generation&&w.documentId===v.documentId)))];
      if(wrappers.length>1||stages.length>1||opened.length>1)throw new Error('ambiguous real host state');
      return {editor,store:editor.dataStore,rootId,session:wrappers[0]?.value,stage:stages[0]?.value,opened:opened[0],key:component.key};
    };
    const actual=inspect(el);if(!actual.session||!actual.opened)throw new Error('actual source session and open state required');
    const {editor,store,rootId}=actual,manager=editor.historyManager;
    const history=manager.getHistory().map((entry: {operations:unknown[];inverseOperations:unknown[]})=>({entry,operations:entry.operations,inverse:entry.inverseOperations,forward:[...entry.operations],backward:[...entry.inverseOperations]}));
    const resources=[...store.getNodes().values()].filter((node: {stype:string;sid:string})=>node.stype==='richText').map((node: {stype:string;sid:string})=>({sid:node.sid,node}));
    const snapshot={rootId,key:actual.key,sessionId:store.getSessionId(),epoch:store.getDocumentEpoch(),model:editor.exportDocument(),selection:editor.selection,historyIndex:manager.getCurrentIndex(),raw:actual.opened.confirmedText,note:actual.opened.note,version:actual.opened.version,confirmedVersion:actual.opened.confirmedVersion};
    return {inspect,actual,editor,store,rootId,rootNode:store.getNode(rootId),manager,history,resources,snapshot:structuredClone(snapshot),dom:el.outerHTML};
  });
}
for(const [label,target] of [['A2',NATIVE_NOTE_FIXTURES.TARGET_A2],['B',NATIVE_NOTE_FIXTURES.SOURCE_B]] as const) {
  test(`actual Office Note host stages complete ${label} separately without source DOM or writes`,async({page},info)=>{
    const {host,calls,writes}=await openActualHost(page,target);
    const source=host.locator('.nw-document [data-note-editor]').first(),paragraph=source.locator('.on-doc > p').first();
    await paragraph.click();await page.keyboard.press('End');await page.keyboard.insertText(' / confirmed setup');
    await expect(paragraph).toHaveText('Parent remains intact / confirmed setup');
    const apple=await page.evaluate(()=>/Mac/.test(navigator.platform));await page.keyboard.press(apple?'Meta+z':'Control+z');
    await expect(paragraph).toHaveText('Parent remains intact');await page.keyboard.press(apple?'Meta+Shift+z':'Control+Shift+z');
    await expect(paragraph).toHaveText('Parent remains intact / confirmed setup');
    await expect(host.locator('[data-save-status]')).toHaveText('저장되지 않음');
    await host.getByRole('button',{name:'저장',exact:true}).click();await expect(host.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const setupWrites=writes.length;expect(setupWrites).toBe(1);
    const retained=await source.elementHandle();expect(retained).not.toBeNull();
    await paragraph.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowRight');
    await expect(source.locator('[data-note-control="toggleBold"]')).toBeVisible();
    const before=await source.evaluate(el=>el.outerHTML);
    const held=await holdSource(page);
    const storageBefore=await page.evaluate(()=>({local:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),session:Object.fromEntries(Object.keys(sessionStorage).sort().map(key=>[key,sessionStorage.getItem(key)]))}));
    const selected=await page.evaluate(()=>({text:getSelection()?.toString(),focus:document.activeElement?.outerHTML}));
    expect(selected.text).toBe('P');expect(await source.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    const readStart=Date.now();
    // Programmatic activation tests that the operation itself does not steal focus.
    await page.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
    const stage=host.locator('[data-native2-stage]');await expect(stage).toBeVisible();
    await expect(stage.locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable','false');
    expect(await source.evaluate((el,held)=>el===held,retained)).toBe(true);
    expect(await source.evaluate(el=>el.outerHTML)).toBe(before);
    expect(await page.evaluate(()=>({text:getSelection()?.toString(),focus:document.activeElement?.outerHTML}))).toEqual(selected);
    const observed=await held.evaluate(held=>{
      const source=document.querySelector('.nw-document [data-note-editor]')!,now=held.inspect(source),target=document.querySelector('[data-native2-stage] [data-note-editor]')!,staged=held.inspect(target),one=staged.stage;
      if(!one)throw new Error('actual mounted stage state required');
      const entries=held.manager.getHistory();
      return {source:{rootId:now.rootId,key:now.key,sessionId:now.store.getSessionId(),epoch:now.store.getDocumentEpoch(),model:now.editor.exportDocument(),selection:now.editor.selection,historyIndex:held.manager.getCurrentIndex(),raw:now.opened.confirmedText,note:now.opened.note,version:now.opened.version,confirmedVersion:now.opened.confirmedVersion},held:held.snapshot,
        refs:now.editor===held.editor&&now.store===held.store&&now.session===held.actual.session&&held.store.getNode(held.rootId)===held.rootNode&&now.editor.historyManager===held.manager&&held.resources.every((r: {sid:string;node:unknown})=>held.store.getNode(r.sid)===r.node)&&entries.length===held.history.length&&held.history.every((h: {entry:unknown;operations:unknown[];inverse:unknown[];forward:unknown[];backward:unknown[]},i:number)=>entries[i]===h.entry&&entries[i].operations===h.operations&&entries[i].inverseOperations===h.inverse&&entries[i].operations.length===h.forward.length&&entries[i].inverseOperations.length===h.backward.length&&h.forward.every((o,j)=>entries[i].operations[j]===o)&&h.backward.every((o,j)=>entries[i].inverseOperations[j]===o)),
        target:{sessionId:staged.store.getSessionId(),model:staged.editor.exportDocument(),native:one.session.exportNativeDocument(),raw:one.session.exportSnapshot(),context:one.session.context,read:one.read,history:staged.editor.getHistoryStats(),independent:staged.editor!==held.editor&&staged.rootId!==held.rootId&&staged.store.getSessionId()!==held.snapshot.sessionId}};
    });
    const completeNodeCount=assertWholeInitialModel(observed.target.model,target.document,observed.target.sessionId,readStart,Date.now());expect(completeNodeCount).toBe(label==='A2'?22:12);
    expect(observed.source).toEqual(observed.held);expect(observed.refs).toBe(true);expect(observed.target.independent).toBe(true);
    expect(observed.target.native).toEqual(target.document);expect(observed.target.raw).toBe(JSON.stringify(target));
    expect(observed.target.context).toEqual({fileVersion:2,rawSnapshotText:JSON.stringify(target),document:target.document,schemaBundle:target.schemaBundle,...('savedAt' in target?{savedAt:target.savedAt}:{})});
    expect(observed.target.read.snapshotText).toBe(JSON.stringify(target));expect(observed.target.read.file).toEqual({fileVersion:2,document:target.document,schemaBundle:target.schemaBundle,...('savedAt' in target?{savedAt:target.savedAt}:{})});
    expect(observed.target.history).toEqual({totalEntries:0,currentIndex:-1,canUndo:false,canRedo:false});
    const expectedSID=await paragraph.locator('.w-text[data-bc-sid]').first().getAttribute('data-bc-sid');
    expect(observed.held.historyIndex).toBeGreaterThanOrEqual(0);
    expect(observed.held.selection.startNodeId).toBe(expectedSID);expect(observed.held.selection.endNodeId).toBe(expectedSID);expect(observed.held.selection.startOffset).toBe(0);expect(observed.held.selection.endOffset).toBe(1);
    expect(observed.target.read.document).toEqual({documentId:targetId,tenantId:id,workspaceId,product:'note',title:'Pinned target',creatorUserId:null,metadataRevision:1,mode:'snapshot',pageId:target.document.attributes.pageId,documentKey:`wonffice-${id}-${targetId}`,fileFormat:'barocss-note',fileVersion:2,revision:2,snapshotHash:createHash('sha256').update(JSON.stringify(target)).digest('hex')});
    expect(observed.held.selection.type).toBe('range');expect(observed.held.selection.collapsed).toBe(false);expect(selected.text).toBeTruthy();
    await info.attach('whole-observed-host-state',{body:JSON.stringify({...observed,domSelectionAndFocus:selected,completeNodeCount,readStart,readEnd:Date.now()},null,2),contentType:'application/json'});
    expect(await page.evaluate(()=>({local:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),session:Object.fromEntries(Object.keys(sessionStorage).sort().map(key=>[key,sessionStorage.getItem(key)]))}))).toEqual(storageBefore);
    expect(calls).toEqual([nativePath,`${nativePath}/schema-bundle`]);expect(writes).toHaveLength(setupWrites);
    await page.screenshot({path:info.outputPath(`staged-${label}.png`),animations:'disabled'});
    await stage.getByRole('button',{name:'닫기',exact:true}).click();await expect(stage).toHaveCount(0);
    expect(await source.evaluate((el,held)=>el===held,retained)).toBe(true);expect(writes).toHaveLength(setupWrites);expect(await page.evaluate(()=>({local:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),session:Object.fromEntries(Object.keys(sessionStorage).sort().map(key=>[key,sessionStorage.getItem(key)]))}))).toEqual(storageBefore);await held.dispose();
  });
}

for(const nested of [false,true])test(`actual host protects latest ${nested?'nested':'root'} input without read or save acknowledgement`,async({page})=>{
  const {host,calls,writes}=await openActualHost(page,NATIVE_NOTE_FIXTURES.SOURCE_B);
  if(nested)await host.getByRole('button',{name:'행 1 열기',exact:true}).click();
  const paragraph=nested?page.locator('[data-db-item-body] .on-doc > p').first():host.locator('.nw-document .on-doc > p').first();
  await paragraph.click();await page.keyboard.press('End');await page.keyboard.insertText(' / last unconfirmed');
  await expect(paragraph).toContainText('last unconfirmed');
  await host.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).click();
  await expect(host.locator('[data-native2-read] [role=alert]')).toBeVisible();await expect(host.locator('[data-native2-stage]')).toHaveCount(0);
  await expect(paragraph).toContainText('last unconfirmed');expect(calls).toEqual([]);expect(writes).toEqual([]);
});
test('normal visible read activation and actual shared session retirement remove stage without publishing',async({page})=>{
  const {host,calls,writes}=await openActualHost(page,NATIVE_NOTE_FIXTURES.SOURCE_B);
  await host.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).click();await expect(host.locator('[data-native2-stage]')).toBeVisible();
  expect(calls).toEqual([nativePath,`${nativePath}/schema-bundle`]);expect(writes).toEqual([]);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.locator('[data-native2-stage]')).toHaveCount(0);expect(writes).toEqual([]);
});

test('actual source composition refuses read without flushing or acknowledgement',async({page})=>{
  const {host,calls,writes}=await openActualHost(page,NATIVE_NOTE_FIXTURES.SOURCE_B);
  const paragraph=host.locator('.nw-document .on-doc > p').first();await paragraph.click();
  await paragraph.dispatchEvent('compositionstart',{bubbles:true,data:'pending'});
  await host.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
  await expect(host.locator('[data-native2-read] [role=alert]')).toBeVisible();expect(calls).toEqual([]);expect(writes).toEqual([]);
  await expect(paragraph).toHaveText('Parent remains intact');await expect(host.locator('[data-native2-stage]')).toHaveCount(0);
  await paragraph.dispatchEvent('compositionend',{bubbles:true,data:''});
});
test('unsupported complete native target refuses without changing the actual source',async({page})=>{
  const target=structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_B);
  Object.assign(target.document.content[0],{stype:'untrustedExecutableNode'});
  const {host,calls,writes}=await openActualHost(page,target),source=host.locator('.nw-document [data-note-editor]').first();
  const before=await source.evaluate(el=>el.outerHTML),retained=await source.elementHandle();
  await host.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).click();await expect(host.locator('[data-native2-read] [role=alert]')).toBeVisible();
  await expect(host.locator('[data-native2-stage]')).toHaveCount(0);expect(await source.evaluate(el=>el.outerHTML)).toBe(before);expect(await source.evaluate((el,old)=>el===old,retained)).toBe(true);expect(writes).toEqual([]);
  expect(calls).toEqual([nativePath]);
});

test('current user logout retires a held response before late native2 installation',async({page},info)=>{
  const {host,calls,writes}=await openActualHost(page,NATIVE_NOTE_FIXTURES.SOURCE_B);
  let release!:()=>void;const stalled=new Promise<void>(resolve=>{release=resolve;});const delivery: string[]=[];
  const target=NATIVE_NOTE_FIXTURES.SOURCE_B,raw=JSON.stringify(target),hash=createHash('sha256').update(raw).digest('hex');
  await page.route(`**${nativePath}/schema-bundle`,async route=>{
    calls.push(new URL(route.request().url()).pathname);expect(route.request().method()).toBe('GET');await stalled;
    try{await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'pinned',documentId:targetId,documentRevision:2,snapshotHash:hash,nativeFormat:{format:'barocss-note',version:2},bundle:target.schemaBundle})});delivery.push('fulfilled after retirement');}
    catch(error){delivery.push(error instanceof Error?error.message:String(error));}
  });
  await host.getByRole('button',{name:'읽기 전용으로 확인',exact:true}).click();await expect.poll(()=>calls).toEqual([nativePath,`${nativePath}/schema-bundle`]);
  await expect(host.locator('[data-native2-stage]')).toHaveCount(0);await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.getByRole('button',{name:'일반 사용자로 들어가기',exact:true})).toBeVisible();release();
  await expect.poll(()=>delivery.length).toBe(1);await expect(page.locator('[data-native2-stage]')).toHaveCount(0);
  expect(writes).toEqual([]);await info.attach('retired-late-delivery',{body:JSON.stringify({delivery,calls,writes}),contentType:'application/json'});
});
