import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';
import { privateControl, type RealStatus } from './helpers/real-recovery-control';

// Real OIDC, two actual APIs and one private PostgreSQL. No fabricated transport response.
// Protected fixture installation/advance and client deadline/ACK timing are separately labelled.
const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const corpus = { A1: NATIVE_NOTE_FIXTURES.SOURCE_A, A2: NATIVE_NOTE_FIXTURES.TARGET_A2, B: NATIVE_NOTE_FIXTURES.SOURCE_B };
const rawHashes = { A1: 'e44cc9fd4336c0f56a7a01d60889dffa5ef17bcb1aca6b2ecba7fdb93abe5b85',
  A2: 'a4814a006a4043d3b1e1e594962c94854ab1e4c91bf4507e6822b2666227d19c',
  B: '954d68f161c4e340e100a148ee17672e732d6d62415334d1f7cca1176c8495d6' };
interface FixtureStatus extends RealStatus {
  schemaPid: number; schemaPort: number;
  native2: { sourceS: string; targetA: string; targetB: string; targetARevisions: { A1: number; A2: number }; corpusEncoding: string };
}
interface FixtureState extends FixtureStatus {
  heads: Array<{ documentId: string; pageId: string; fileVersion: number; revision: number; snapshotHash: string; snapshotText: string }>;
  audit: Record<string, { rows: number; hash: string }>;
}
interface HoldStatus { schemaPid: number; armed: boolean;
  held: { documentId: string; part: 'snapshot' | 'bundle'; responseHash: string } | null;
  lastRelease: { documentId: string; part: string; responseHash: string; reason: string } | null;
}
let declaredSource: unknown;
let declaredSourceRaw: string;
const host = (page: Page) => page.locator('[data-server-note-workspace]');
const source = (page: Page) => host(page).locator('.nw-document [data-note-editor]').first();
const stage = (page: Page) => host(page).locator('[data-native2-stage]');
const read = (page: Page) => host(page).getByRole('button', { name: '읽기 전용으로 확인', exact: true });
const paragraph = (page: Page) => source(page).locator('.on-doc > p').first();
const state = () => privateControl<FixtureState>({ action: 'native2-state' });
const controlStatus = () => privateControl<FixtureStatus>({ action: 'status' });

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.beforeAll(async () => {
  if (!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE)
    throw new Error('Protected genuine OIDC/private PostgreSQL native2 fixture is required.');
  for (const key of ['A1', 'A2', 'B'] as const) expect(hash(JSON.stringify(corpus[key]))).toBe(rawHashes[key]);
  // Authored setup source, loaded before genuine producer observation, never inferred from API/model output.
  const declared = await import(new URL('../../office-api/test/native2-auth-ui-corpus.mjs', import.meta.url).href);
  for (const key of ['A1', 'A2', 'B'] as const) expect(JSON.stringify(declared.native2Corpus[key])).toBe(JSON.stringify(corpus[key]));
  declaredSource = declared.native2OriginalSource;
  declaredSourceRaw = JSON.stringify(declaredSource);
  const status = await controlStatus();
  expect(status.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  expect(status.workspaceId).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  expect(status.native2.targetARevisions).toEqual({ A1: 1, A2: 2 });
  expect(status.native2.corpusEncoding).toBe('JSON.stringify compact UTF-8');
  expect(status.databaseRunning && status.apiRunning).toBe(true);
  expect(status.schemaPid).toBeGreaterThan(0);
});

async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', status: FixtureStatus) {
  await page.goto(`${origin}/products/note/?tenant=${status.tenantId}&workspace=${status.workspaceId}&document=${status.native2.sourceS}&product=note`);
  await expect.poll(async () => await host(page).isVisible() || await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).isVisible()).toBe(true);
  if (!(await host(page).isVisible())) {
    await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
    await expect.poll(async () => await host(page).isVisible() || await page.locator('#username').isVisible()).toBe(true);
    if (await page.locator('#username').isVisible()) {
    const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { users: Record<string, { username?: string; password: string }> };
    await page.locator('#username').fill(fixture.users[alias]!.username ?? alias);
    await page.locator('#password').fill(fixture.users[alias]!.password);
    await page.locator('#kc-login').click();
    }
  }
  await expect(host(page)).toBeVisible();
  await expect(source(page)).toBeVisible();
  await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
}
function network(page: Page) {
  const records: Array<{ method: string; path: string; bodyHash?: string; status?: number }> = [];
  let tokenLifetime = 0, bearer = '';
  const identity = { currentUserId: '' };
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return;
    if (request.headers().authorization) bearer = request.headers().authorization;
    const body = request.postData();
    records.push({ method: request.method(), path, ...(body ? { bodyHash: hash(body) } : {}) });
  });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('/protocol/openid-connect/token') && response.ok())
      void response.json().then((value: { expires_in?: number }) => { if (typeof value.expires_in === 'number') tokenLifetime = value.expires_in * 1000; });
    if (path.startsWith('/api/')) records.push({ method: 'RESPONSE', path, status: response.status() });
  });
  return { records, identity, bearer: () => bearer, tokenLifetime: () => tokenLifetime, mutations: () => records.filter(one => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(one.method)) };
}
async function refreshMetadata(page: Page) {
  const panel = host(page).locator('[data-workspace-panel="navigation"]');
  if (!(await panel.isVisible())) {
    await host(page).locator('[data-menu="document"]').click();
    const actions = page.locator('[data-menu-item="document-actions"]');
    await expect(actions).toHaveText('문서 작업');
    await actions.click();
  }
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '목록 새로고침', exact: true }).click();
}
async function target(page: Page, documentId: string) {
  await host(page).getByRole('textbox', { name: '읽을 native2 문서 ID' }).fill(documentId);
}
async function hold(page: Page, documentId: string) {
  const armed = await privateControl<HoldStatus>({ action: 'native2-hold', documentId, part: 'bundle' });
  expect(armed.armed).toBe(true); expect(armed.held).toBeNull();
  await read(page).click();
  let reached: HoldStatus | undefined;
  await expect.poll(async () => { reached = await privateControl<HoldStatus>({ action: 'native2-held' }); return reached.held?.documentId; }, { timeout: 12_000 }).toBe(documentId);
  expect(reached!.armed).toBe(false); expect(reached!.held!.part).toBe('bundle');
  expect(reached!.held!.responseHash).toMatch(/^[a-f0-9]{64}$/);
  return reached!.held!;
}
async function release(reached: NonNullable<HoldStatus['held']>) {
  const released = await privateControl<HoldStatus>({ action: 'native2-release' });
  expect(released.armed).toBe(false); expect(released.held).toBeNull();
  expect(released.lastRelease).toEqual({ ...reached, reason: 'manual' });
}
async function viewState(page: Page) {
  return source(page).evaluate(el => {
    const selected = getSelection();
    return { dom: el.outerHTML, range: selected ? { text: selected.toString(), anchorOffset: selected.anchorOffset,
      focusOffset: selected.focusOffset, anchorSid: selected.anchorNode?.parentElement?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid') ?? null,
      focusSid: selected.focusNode?.parentElement?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid') ?? null } : null,
      focus: document.activeElement?.outerHTML, scroll: { x: scrollX, y: scrollY, top: el.scrollTop, left: el.scrollLeft },
      storage: { local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
        session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])) } };
  });
}
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
      return {editor,store:editor.dataStore,rootId,session:wrappers[0]?.value,stage:stages[0]?.value,opened:opened[0],key:component.key,states};
    };
    const actual=inspect(el);if(!actual.session||!actual.opened)throw new Error('actual source session and open state required');
    const {editor,store,rootId}=actual,manager=editor.historyManager;
    const history=manager.getHistory().map((entry: {operations:unknown[];inverseOperations:unknown[]})=>({entry,operations:entry.operations,inverse:entry.inverseOperations,forward:[...entry.operations],backward:[...entry.inverseOperations]}));
    const resources=[...store.getNodes().values()].filter((node: {stype:string;sid:string})=>node.stype==='richText').map((node: {stype:string;sid:string})=>({sid:node.sid,node}));
    const pending=[...new Set(actual.states.map(value=>value?.current??value).filter(value=>value?.attempt&&value?.owner))];
    const drafts=[...new Set(actual.states.map(value=>value?.current??value).filter(value=>typeof value?.record?.snapshotText==='string'&&value?.generation))];
    const deliveries=actual.states.map(value=>value?.current).filter(value=>value instanceof Set&&value.size>0&&[...value].every(one=>typeof one==='function'&&typeof one.hasPendingInput==='function'));
    if(pending.length>1||drafts.length>1||deliveries.length!==1)throw new Error('unique actual input/pending/draft state required');
    const inputSet=deliveries[0],inputEntries=[...inputSet],inputs=inputEntries.map(one=>({delivery:one,current:one.captureInputIntent?.()}));
    const snapshot={fixedAttempt:pending[0]?.attempt??null,draftRecord:drafts[0]?.record??null,inputPending:inputEntries.map(one=>one.hasPendingInput()),rootId,key:actual.key,sessionId:store.getSessionId(),epoch:store.getDocumentEpoch(),model:editor.exportDocument(),selection:editor.selection,historyIndex:manager.getCurrentIndex(),raw:actual.opened.confirmedText,note:actual.opened.note,version:actual.opened.version,confirmedVersion:actual.opened.confirmedVersion};
    return {inspect,actual,editor,store,rootId,rootNode:store.getNode(rootId),manager,history,resources,snapshot:structuredClone(snapshot),dom:el.outerHTML,inputSet,inputEntries,inputs};
  });
}

async function sourceObservation(page: Page, held: Awaited<ReturnType<typeof holdSource>>) {
  return source(page).evaluate((el, before) => {
    const now = before.inspect(el), manager = now.editor.historyManager, entries = manager.getHistory();
    const pending = [...new Set(now.states.map(value => value?.current ?? value).filter(value => value?.attempt && value?.owner))];
    const drafts = [...new Set(now.states.map(value => value?.current ?? value).filter(value => typeof value?.record?.snapshotText === 'string' && value?.generation))];
    return { value: { fixedAttempt: pending[0]?.attempt ?? null, draftRecord: drafts[0]?.record ?? null,
      inputPending: before.inputEntries.map(one => one.hasPendingInput()), rootId: now.rootId, key: now.key,
      sessionId: now.store.getSessionId(), epoch: now.store.getDocumentEpoch(), model: now.editor.exportDocument(), selection: now.editor.selection,
      historyIndex: manager.getCurrentIndex(), raw: now.opened.confirmedText, note: now.opened.note, version: now.opened.version, confirmedVersion: now.opened.confirmedVersion },
      refs: now.editor === before.editor && now.store === before.store && now.session === before.actual.session &&
        now.store.getNode(before.rootId) === before.rootNode && manager === before.manager &&
        before.resources.every((one: { sid: string; node: unknown }) => now.store.getNode(one.sid) === one.node) &&
        entries.length === before.history.length && before.history.every((one: { entry: unknown; operations: unknown[]; inverse: unknown[]; forward: unknown[]; backward: unknown[] }, index: number) => entries[index] === one.entry &&
          entries[index].operations === one.operations && entries[index].inverseOperations === one.inverse &&
          entries[index].operations.length === one.forward.length && entries[index].inverseOperations.length === one.backward.length &&
          one.forward.every((operation: unknown, index: number) => entries[before.history.indexOf(one)].operations[index] === operation) &&
          one.backward.every((operation: unknown, index: number) => entries[before.history.indexOf(one)].inverseOperations[index] === operation)),
      registeredInputs: before.inputEntries.length === before.inputSet.size && before.inputEntries.every(one => before.inputSet.has(one)),
      inputIntentsCurrent: before.inputs.every(one => !!one.current?.()) };
  }, held);
}
async function unchanged(page: Page, held: Awaited<ReturnType<typeof holdSource>>) {
  const observed = await sourceObservation(page, held);
  const expected = await held.evaluate(one => one.snapshot);
  expect(observed.value).toEqual(expected); expect(observed.refs).toBe(true); expect(observed.registeredInputs).toBe(true);
  return observed;
}
async function staged(page: Page, held: Awaited<ReturnType<typeof holdSource>>) {
  return stage(page).locator('[data-note-editor]').first().evaluate((el, original) => {
    const actual = original.inspect(el), one = actual.stage;
    if (!one) throw new Error('Actual mounted readonly native2 stage is required');
    return { model: actual.editor.exportDocument(), sessionId: actual.store.getSessionId(), native: one.session.exportNativeDocument(),
      raw: one.session.exportSnapshot(), context: one.session.context, read: one.read,
      history: actual.editor.getHistoryStats(), independent: actual.editor !== original.editor && actual.rootId !== original.rootId && actual.store.getSessionId() !== original.store.getSessionId() };
  }, held);
}

function mainText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const value = node as { stype?: string; text?: string; content?: unknown[] };
  if (value.stype === 'resources') return [];
  return [...(typeof value.text === 'string' ? [value.text] : []), ...(value.content ?? []).flatMap(mainText)];
}
function strikeText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const value = node as { text?: string; marks?: Array<{ stype?: string; range?: number[] }>; content?: unknown[] };
  return [...(value.marks ?? []).filter(mark => mark.stype === 'strike' && mark.range?.length === 2)
    .map(mark => value.text!.slice(mark.range![0], mark.range![1])), ...(value.content ?? []).flatMap(strikeText)];
}

async function fullStage(page: Page, status: FixtureStatus, key: keyof typeof corpus, info: TestInfo, records: ReturnType<typeof network>) {
  const documentId = key === 'B' ? status.native2.targetB : status.native2.targetA;
  await target(page, documentId);
  await paragraph(page).click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight');
  const sid = await paragraph(page).locator('.w-text[data-bc-sid]').first().getAttribute('data-bc-sid');
  expect(sid).toBeTruthy();
  const preparation = await holdSource(page);
  try {
    // Selection delivery is asynchronous. Require the real native and DOM range
    // while its input host still owns focus, before moving focus to the read action.
    await expect.poll(async () => source(page).evaluate((el, original) => {
      const actual = original.inspect(el), selected = actual.editor.selection, dom = getSelection();
      return { type: selected?.type ?? null, collapsed: selected?.collapsed ?? null,
        startNodeId: selected?.startNodeId ?? null, endNodeId: selected?.endNodeId ?? null,
        startOffset: selected?.startOffset ?? null, endOffset: selected?.endOffset ?? null, domText: dom?.toString() ?? '' };
    }, preparation)).toEqual({ type: 'range', collapsed: false, startNodeId: sid, endNodeId: sid, startOffset: 0, endOffset: 1, domText: 'T' });
    const after = await sourceObservation(page, preparation), original = await preparation.evaluate(one => one.snapshot);
    expect(after.value.model).toEqual(original.model); expect(after.value.raw).toBe(original.raw);
    expect(after.value.fixedAttempt).toEqual(original.fixedAttempt); expect(after.value.draftRecord).toEqual(original.draftRecord);
    expect(after.refs).toBe(true);
    await info.attach(`positive-${key}-before-read`, { body: JSON.stringify({ selection: after.value.selection,
      qualification: 'Actual keyboard selection delivery establishes live DOM and positive native range before read producer; no public command/direct editor setter; source body/history/input/draft unchanged' }), contentType: 'application/json' });
  } finally { await preparation.dispose(); }
  // Prepare focus for the explicit public read intent before capturing the positive original baseline.
  await read(page).focus();
  const retained = await source(page).elementHandle(), held = await holdSource(page), view = await viewState(page);
  const before = await state(), mutationCount = records.mutations().length, requestCount = records.records.length, start = Date.now();
  try {
    const sourceBefore = await held.evaluate(one => one.snapshot);
    expect(sourceBefore.selection.type).toBe('range'); expect(sourceBefore.selection.collapsed).toBe(false);
    expect(sourceBefore.selection.startNodeId).toBe(sid); expect(sourceBefore.selection.endNodeId).toBe(sid);
    expect(sourceBefore.selection.startOffset).toBe(0); expect(sourceBefore.selection.endOffset).toBe(1);
    expect(view.range?.text.length).toBeGreaterThan(0); expect(sourceBefore.historyIndex).toBeGreaterThanOrEqual(0);
    const reached = await hold(page, documentId);
    await unchanged(page, held); expect(await viewState(page)).toEqual(view); expect(await state()).toEqual(before);
    const response = page.waitForResponse(one => new URL(one.url()).pathname.endsWith(`/note-native2/documents/${documentId}/schema-bundle`) && one.request().method() === 'GET');
    await release(reached); await expect(stage(page)).toBeVisible();
    expect(hash(await (await response).body())).toBe(reached.responseHash);
    await expect(stage(page).locator('[data-note-editor]').first()).toHaveAttribute('data-note-editable', 'false');
    const observed = await staged(page, held), authored = corpus[key], raw = JSON.stringify(authored);
    const nodes = assertWholeInitialModel(observed.model, authored.document, observed.sessionId, start, Date.now());
    expect(nodes).toBe(key === 'B' ? 12 : 22); expect(observed.independent).toBe(true);
    const rendered = await stage(page).locator('[data-note-editor]').first().textContent();
    for (const text of mainText(authored.document)) expect(rendered).toContain(text);
    if (key === 'B') {
      const expectedStrike = strikeText(authored.document); expect(expectedStrike.length).toBeGreaterThan(0);
      for (const text of expectedStrike) expect(await stage(page).locator('[data-note-editor]').first().evaluate((el, fixed) =>
        [...el.querySelectorAll('*')].some(node => node.textContent?.includes(fixed) && getComputedStyle(node).textDecorationLine.includes('line-through')), text)).toBe(true);
    }
    expect(observed.native).toEqual(authored.document); expect(observed.raw).toBe(raw); expect(hash(observed.raw)).toBe(rawHashes[key]);
    const expectedFile = { fileVersion: 2, document: authored.document, schemaBundle: authored.schemaBundle, ...('savedAt' in authored ? { savedAt: authored.savedAt } : {}) };
    expect(observed.read.file).toEqual(expectedFile); expect(observed.read.snapshotText).toBe(raw);
    expect(observed.context).toEqual({ ...expectedFile, rawSnapshotText: raw });
    const databaseHead = before.heads.find(one => one.documentId === documentId)!;
    expect(observed.read.document).toEqual({ documentId, tenantId: status.tenantId, workspaceId: status.workspaceId, product: 'note',
      title: key === 'B' ? 'Native2 full B' : 'Native2 full A', creatorUserId: records.identity.currentUserId,
      metadataRevision: 1, mode: 'snapshot', pageId: authored.document.attributes.pageId, documentKey: `wonffice-${status.tenantId}-${documentId}`,
      fileFormat: 'barocss-note', fileVersion: 2, revision: key === 'A2' ? 2 : 1, snapshotHash: rawHashes[key] });
    expect(observed.read.document.creatorUserId).toMatch(/^[a-f0-9-]{36}$/);
    expect(databaseHead).toEqual({ documentId, pageId: authored.document.attributes.pageId, revision: key === 'A2' ? 2 : 1,
      fileVersion: 2, snapshotHash: rawHashes[key], snapshotText: raw });
    expect(observed.history).toEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
    await unchanged(page, held); expect(await viewState(page)).toEqual(view);
    expect(records.records.slice(requestCount).filter(one => /\/(receipts|verification-runs|criterion-confirmations)(\/|$)/.test(one.path))).toEqual([]);
    expect(records.mutations()).toHaveLength(mutationCount); expect(await state()).toEqual(before);
    expect(records.records.slice(requestCount).filter(one => one.method !== 'RESPONSE' && one.path.includes('/note-native2/'))).toEqual([
      { method: 'GET', path: `/api/v1/tenants/${status.tenantId}/note-native2/documents/${documentId}` },
      { method: 'GET', path: `/api/v1/tenants/${status.tenantId}/note-native2/documents/${documentId}/schema-bundle` }]);
    await info.attach(`full-${key}`, { body: JSON.stringify({ observed, source: sourceBefore, reached, nodes, qualification: 'Actual current OIDC/SchemaServer/ordinary API/private PG/UI; actual backend response timing explicitly controlled' }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`full-${key}.png`), animations: 'disabled' });
    await stage(page).getByRole('button', { name: '닫기', exact: true }).click(); await expect(stage(page)).toHaveCount(0);
    await unchanged(page, held); expect(await source(page).evaluate((el, saved) => el === saved, retained)).toBe(true);
    expect(await state()).toEqual(before); expect(records.mutations()).toHaveLength(mutationCount);
  } finally { await privateControl({ action: 'native2-release' }); await held.dispose(); await retained?.dispose(); }
}



async function nestedSnapshot(page: Page, original: Awaited<ReturnType<typeof holdSource>>) {
  return page.locator('[data-db-item-body] [data-note-editor]').first().evaluateHandle((el, before) => {
    const actual = before.inspect(el), manager = actual.editor.historyManager;
    if (actual.editor === before.editor || actual.store.getSessionId() === before.store.getSessionId()) throw new Error('Actual separate nested input engine required');
    const sid = el.querySelector('.w-text[data-bc-sid]')?.getAttribute('data-bc-sid');
    if (!sid || actual.editor.selection.startNodeId !== sid || !sid.startsWith(actual.store.getSessionId() + ':')) throw new Error('Actual positive nested SID selection required');
    const entries = manager.getHistory().map((one: { operations: unknown[]; inverseOperations: unknown[] }) => ({ one, operations: one.operations, inverse: one.inverseOperations }));
    return { actual, manager, entries, sid, dom: el.outerHTML, value: structuredClone({ model: actual.editor.exportDocument(),
      rootId: actual.rootId, sessionId: actual.store.getSessionId(), epoch: actual.store.getDocumentEpoch(), selection: actual.editor.selection, index: manager.getCurrentIndex() }) };
  }, original);
}
async function unchangedNested(page: Page, before: Awaited<ReturnType<typeof nestedSnapshot>>) {
  const result = await page.locator('[data-db-item-body] [data-note-editor]').first().evaluate((el, held) => {
    const actual = held.actual, entries = actual.editor.historyManager.getHistory();
    return { value: { model: actual.editor.exportDocument(), rootId: actual.rootId, sessionId: actual.store.getSessionId(),
      epoch: actual.store.getDocumentEpoch(), selection: actual.editor.selection, index: held.manager.getCurrentIndex() },
      dom: el.outerHTML, refs: actual.editor.historyManager === held.manager && actual.editor.getRootId() === el.getAttribute('data-note-editor') &&
        entries.length === held.entries.length && held.entries.every((one: { one: unknown; operations: unknown[]; inverse: unknown[] }, index: number) => entries[index] === one.one && entries[index].operations === one.operations && entries[index].inverseOperations === one.inverse) };
  }, before);
  expect(result.value).toEqual(await before.evaluate(one => one.value)); expect(result.dom).toBe(await before.evaluate(one => one.dom)); expect(result.refs).toBe(true);
}


async function metadataAuthorityFailure(page: Page, status: FixtureStatus, info: TestInfo) {
  await target(page, status.native2.targetB);
  const pending = await hold(page, status.native2.targetB), held = await holdSource(page), before = await state();
  try {
    const stopped = await privateControl<FixtureStatus>({ action: 'api-stop' });
    expect(stopped.apiRunning).toBe(false); expect(stopped.schemaPid).toBe(before.schemaPid);
    await refreshMetadata(page);
    await expect(source(page)).toHaveAttribute('data-note-editable', 'false');
    await unchanged(page, held);
    const resumed = await privateControl<FixtureStatus>({ action: 'api-start' });
    expect(resumed.apiRunning).toBe(true); expect(resumed.databaseIdentity).toBe(before.databaseIdentity);
    expect(resumed.databaseGeneration).toBe(before.databaseGeneration); expect(resumed.schemaPid).toBe(before.schemaPid);
    await release(pending); await expect(stage(page)).toHaveCount(0); await unchanged(page, held);
    const after = await state(); expect(after.heads).toEqual(before.heads); expect(after.audit).toEqual(before.audit);
    await refreshMetadata(page);
    await expect(source(page)).toHaveAttribute('data-note-editable', 'false'); await unchanged(page, held);
    expect((await state()).heads).toEqual(before.heads); expect((await state()).audit).toEqual(before.audit);
    await info.attach('actual-metadata-authority-failure', { body: JSON.stringify({ beforePid: before.apiPid, afterPid: resumed.apiPid,
      sameDatabaseIdentity: before.databaseIdentity, actualHeldResponse: pending,
      qualification: 'Real ordinary API stop/current unknown authority while SchemaServer response held; original session/model/history retained, source writer disabled, successful metadata alone does not reenforce writer. Explicit later fresh owner entry is separate.' }), contentType: 'application/json' });
  } finally { await privateControl({ action: 'api-start' }); await privateControl({ action: 'native2-release' }); await held.dispose(); }
}

async function fixedAttemptAndLaterDraft(page: Page, info: TestInfo, records: ReturnType<typeof network>) {
  const endpoint = '**/api/v1/tenants/*/documents/*/snapshot';
  let unblock: (() => void) | undefined, reason = 'not_released';
  let reachedResolve: (value: { body: string; responseHash: string }) => void = () => {};
  const reached = new Promise<{ body: string; responseHash: string }>(resolve => { reachedResolve = resolve; });
  await page.route(endpoint, async route => {
    if (route.request().method() !== 'PUT') { await route.continue(); return; }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const actualBytes = await response.body();
    const wait = new Promise<void>(resolve => { unblock = resolve; });
    const timeout = setTimeout(() => { reason = 'timeout'; unblock?.(); }, 20_000);
    reachedResolve({ body: route.request().postData()!, responseHash: hash(actualBytes) });
    try { await wait; await route.fulfill({ response }); }
    finally { clearTimeout(timeout); }
  });
  let held: Awaited<ReturnType<typeof holdSource>> | undefined;
  try {
    await paragraph(page).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / fixed request');
    await host(page).getByRole('button', { name: '저장', exact: true }).click();
    const sent = await reached, count = records.mutations().length, before = await state();
    await paragraph(page).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / later while ACK pending');
    await expect(paragraph(page)).toContainText('later while ACK pending');
    await page.keyboard.press('Tab');
    held = await holdSource(page);
    await expect.poll(async () => (await sourceObservation(page, held!)).value.draftRecord?.snapshotText.includes('later while ACK pending')).toBe(true);
    const captured = await sourceObservation(page, held), requestBody = JSON.parse(sent.body) as { snapshotText: string };
    expect(captured.value.fixedAttempt).not.toBeNull();
    expect(captured.value.fixedAttempt.snapshotText).toBe(requestBody.snapshotText);
    expect(captured.value.fixedAttempt.snapshotText).not.toContain('later while ACK pending');
    expect(captured.value.draftRecord.status).toBe('draft');
    const stable = await holdSource(page); await held.dispose(); held = stable;
    await expect(read(page)).toBeDisabled(); await read(page).evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error('public read button required'); button.click(); });
    await unchanged(page, held); await expect(stage(page)).toHaveCount(0); expect(await state()).toEqual(before);
    expect(records.mutations()).toHaveLength(count); expect(reason).toBe('not_released');
    const frozenAttempt = structuredClone(captured.value.fixedAttempt), laterDraft = structuredClone(captured.value.draftRecord);
    reason = 'manual'; unblock!();
    await expect(host(page).locator('[data-save-status]')).toHaveText('저장되지 않음');
    await expect(paragraph(page)).toContainText('later while ACK pending');
    const after = await sourceObservation(page, held);
    expect(after.value.draftRecord).toEqual(laterDraft);
    expect(after.value.model).toEqual(captured.value.model); expect(after.refs).toBe(true);
    expect(records.mutations()).toHaveLength(count); expect(reason).toBe('manual');
    await info.attach('fixed-attempt-later-draft', { body: JSON.stringify({ frozenAttempt, laterDraft, actualRequestBodyHash: hash(sent.body), actualResponseHash: sent.responseHash,
      qualification: 'Actual ordinary API committed fixed request, controlled browser delay of unchanged real ACK bytes; disabled public read did not ACK/reset/retry or clear later draft. Release manual.' }), contentType: 'application/json' });
  } finally { if (reason === 'not_released') reason = 'cleanup'; unblock?.(); await page.unroute(endpoint); await held?.dispose(); }
  await host(page).getByRole('button', { name: '저장', exact: true }).click(); await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
}

test('genuine current native2 read stages full A1/A2/B and preserves the whole mounted source through refusals and retirement', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const records = network(page), status = await controlStatus();
  const phases: Array<Record<string, unknown>> = [];
  await page.clock.install();
  let betaContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await login(page, 'alpha-editor', status);
    const me = await page.request.get(`${origin}/api/v1/me`, { headers: { Authorization: records.bearer() } });
    expect(me.status()).toBe(200); const identity = await me.json() as { currentUserId: string; issuer: string; subject: string };
    const oidc = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { issuer: string; users: Record<string, { id: string }> };
    expect(identity.issuer).toBe(oidc.issuer); expect(identity.subject).toBe(oidc.users['alpha-editor']!.id);
    expect(identity.currentUserId).toMatch(/^[a-f0-9-]{36}$/); records.identity.currentUserId = identity.currentUserId;
    const installed = await state();
    expect(installed.heads.find(one => one.documentId === status.native2.sourceS)?.snapshotText).toBe(declaredSourceRaw);
    const initial = await holdSource(page); expect(await initial.evaluate(one => one.snapshot.note)).toEqual((declaredSource as { document: unknown }).document); await initial.dispose();
    // Operated real source history, not a fabricated history manager.
    await paragraph(page).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / operated history');
    const apple = await page.evaluate(() => /Mac/.test(navigator.platform));
    await page.keyboard.press(apple ? 'Meta+z' : 'Control+z'); await expect(paragraph(page)).not.toContainText('operated history');
    await page.keyboard.press(apple ? 'Meta+Shift+z' : 'Control+Shift+z'); await expect(paragraph(page)).toContainText('operated history');
    await host(page).getByRole('button', { name: '저장', exact: true }).click(); await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    const expectedSource = JSON.parse(declaredSourceRaw) as { document: { content: Array<{ content: Array<{ text: string }> }> } };
    expectedSource.document.content[0]!.content[0]!.text += ' / operated history';
    expect(JSON.parse((await state()).heads.find(one => one.documentId === status.native2.sourceS)!.snapshotText)).toEqual(expectedSource);
    phases.push({ phase: 'explicit source history/save setup', qualification: 'Separate ordinary v1 setup write; not a read effect/adoption' });
    await fullStage(page, status, 'A1', info, records); await fullStage(page, status, 'B', info, records);
    await target(page, status.native2.targetA);
    const obsolete = await hold(page, status.native2.targetA), replacementSource = await holdSource(page);
    const prior = await state(); const advance = await privateControl<{ revision: number; snapshotHash: string; setupEffect: string }>({ action: 'native2-advance-a2' });
    expect(advance.revision).toBe(2); expect(advance.snapshotHash).toBe(rawHashes.A2); expect(advance.setupEffect).toBe('protected fixture head A1→A2; not a product adoption');
    const next = await state();
    for (const id of [status.native2.sourceS, status.native2.targetB]) expect(next.heads.find(one => one.documentId === id)).toEqual(prior.heads.find(one => one.documentId === id));
    for (const [table, audit] of Object.entries(prior.audit)) if (table !== 'document_snapshots') expect(next.audit[table]).toEqual(audit);
    await read(page).click(); await expect(stage(page)).toBeVisible();
    const replacement = await staged(page, replacementSource);
    expect(replacement.raw).toBe(JSON.stringify(corpus.A2)); expect(replacement.native).toEqual(corpus.A2.document);
    await release(obsolete); await expect(stage(page)).toBeVisible(); expect(await staged(page, replacementSource)).toEqual(replacement);
    await unchanged(page, replacementSource); expect((await state()).audit).toEqual(next.audit);
    await stage(page).getByRole('button', { name: '닫기', exact: true }).click(); await replacementSource.dispose();
    phases.push({ phase: 'old actual A1 response cannot replace explicitly observed A2 read generation', qualification: 'Protected advance plus explicit public read replacement; not unseen head-change detection' });
    phases.push({ phase: 'protected same-target A1→A2 setup', qualification: 'Not ordinary adoption/save or two simultaneous A documents' });
    await fullStage(page, status, 'A2', info, records);
    // A visible metadata refresh must not replace the source or its operated history.
    const refreshHeld = await holdSource(page), refreshBefore = await state(), refreshWrites = records.mutations().length;
    await refreshMetadata(page);
    await unchanged(page, refreshHeld); expect(await state()).toEqual(refreshBefore); expect(records.mutations()).toHaveLength(refreshWrites); await refreshHeld.dispose();
    for (const nested of [false, true]) {
      await target(page, status.native2.targetB);
      if (nested) { await host(page).getByRole('button', { name: '행 1 열기', exact: true }).click(); await expect(page.locator('[data-db-item-body] [data-note-editor]')).toBeVisible(); }
      const input = nested ? page.locator('[data-db-item-body] .on-doc > p').first() : paragraph(page);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await input.click(); await page.keyboard.press('End'); await page.keyboard.insertText(nested ? ' / last nested draft' : ' / last root draft');
      await expect(input).toContainText(nested ? 'last nested draft' : 'last root draft');
      const held = await holdSource(page), before = await state(), count = records.records.length;
      expect((await held.evaluate(one => one.snapshot)).inputPending.some(Boolean)).toBe(true);
      const nestedHeld = nested ? await nestedSnapshot(page, held) : undefined;
      // Controlled activation of the public button keeps the actual last-input focus intact.
      await read(page).evaluate(button => { if (!(button instanceof HTMLButtonElement)) throw new Error('public read button required'); button.click(); }); await expect(host(page).locator('[data-native2-read] [role=alert]')).toBeVisible();
      await expect(stage(page)).toHaveCount(0); await unchanged(page, held); if (nestedHeld) await unchangedNested(page, nestedHeld); expect(await state()).toEqual(before);
      expect(records.records.slice(count).filter(one => one.path.includes('/note-native2/') || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(one.method))).toEqual([]);
      phases.push({ phase: nested ? 'actual nested input refusal' : 'actual root input refusal', qualification: 'Real keyboard/editor and genuine authority; client scheduling and public button activation timing controlled to hold unflushed last input without implicit blur/flush' });
      await nestedHeld?.dispose(); await held.dispose(); await page.clock.resume();
      if (nested) {
        const dialog = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
        await dialog.getByRole('button', { name: '닫기', exact: true }).click();
        await expect(dialog).toHaveCount(0);
      }
      await host(page).getByRole('button', { name: '저장', exact: true }).click(); await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    }
    await fixedAttemptAndLaterDraft(page, info, records);
    phases.push({ phase: 'fixed actual save request/later draft refusal and unchanged ACK delay' });
    // Actual held response cannot overwrite a source changed by a real subsequent input.
    await target(page, status.native2.targetB); const sourceChangedBefore = await state(); const changing = await hold(page, status.native2.targetB);
    await paragraph(page).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / later source generation');
    await expect(paragraph(page)).toContainText('later source generation');
    const waiting = await holdSource(page);
    await expect.poll(async () => (await sourceObservation(page, waiting)).value.draftRecord?.snapshotText.includes('later source generation')).toBe(true);
    await expect.poll(async () => (await sourceObservation(page, waiting)).value.inputPending.some(Boolean)).toBe(false);
    await waiting.dispose();
    const changed = await holdSource(page); await release(changing); await expect(stage(page)).toHaveCount(0); await unchanged(page, changed);
    expect(await state()).toEqual(sourceChangedBefore); await changed.dispose();
    await host(page).getByRole('button', { name: '저장', exact: true }).click(); await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
    betaContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const beta = await betaContext.newPage();
    const betaRequests = network(beta);
    await login(beta, 'beta-viewer', status);
    const betaMe = await beta.request.get(`${origin}/api/v1/me`, { headers: { Authorization: betaRequests.bearer() } });
    expect(betaMe.status()).toBe(200);
    const betaIdentity = await betaMe.json() as { issuer: string; subject: string; currentUserId: string; tenants: Array<{ tenantId: string; role: string }> };
    expect(betaIdentity.issuer).toBe(oidc.issuer); expect(betaIdentity.subject).toBe(oidc.users['beta-viewer']!.id);
    expect(betaIdentity.currentUserId).toMatch(/^[a-f0-9-]{36}$/);
    expect(betaIdentity.subject).not.toBe(identity.subject); expect(betaIdentity.currentUserId).not.toBe(identity.currentUserId);
    expect(betaIdentity.tenants.find(one => one.tenantId === status.tenantId)?.role).toBe('viewer');
    phases.push({ phase: 'independently checked genuine Beta current identity before role mutation', issuer: betaIdentity.issuer,
      subject: betaIdentity.subject, currentUserId: betaIdentity.currentUserId, qualification: 'Distinct real synthetic account/browser context, not independent human approval' });
    await target(beta, status.native2.targetB);
    const aba = await hold(beta, status.native2.targetB);
    await privateControl({ action: 'beta-role', role: 'editor' });
    await target(beta, status.native2.targetA); await read(beta).click(); await expect(host(beta).locator('[data-native2-read] [role=alert]')).toBeVisible();
    await privateControl({ action: 'beta-role', role: 'viewer' }); await release(aba); await expect(stage(beta)).toHaveCount(0);
    phases.push({ phase: 'observed role ABA with consumer refusal and retired prior generation', qualification: 'Actual role change/current failed public read before restore; not proof against unseen ABA' });
    await privateControl({ action: 'beta-active', active: false }); await target(beta, status.native2.targetB); await read(beta).click();
    await expect(stage(beta)).toHaveCount(0); await expect(host(beta).locator('[data-native2-read] [role=alert]')).toBeVisible();
    await privateControl({ action: 'beta-active', active: true });
    await betaContext.close(); betaContext = undefined;
    await metadataAuthorityFailure(page, status, info);
    phases.push({ phase: 'actual metadata unknown authority and sticky source writer ceiling' });
    await login(page, 'alpha-editor', status);
    phases.push({ phase: 'fresh explicit owner/source entry after observed metadata failure', qualification: 'Separate recovery entry; not metadata-only writer reenabling or stage cleanup resetting source' });
    await target(page, status.native2.targetB); await read(page).click(); await expect(stage(page)).toBeVisible();
    expect(records.tokenLifetime()).toBeGreaterThan(0); await page.clock.fastForward(records.tokenLifetime() + 1000); await expect(stage(page)).toHaveCount(0);
    phases.push({ phase: 'captured actual token local deadline retirement', qualification: 'Controlled client clock; not elapsed real IdP token expiry' });
    const lateContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try { const late = await lateContext.newPage(); await login(late, 'alpha-editor', status); await target(late, status.native2.targetB);
      const pending = await hold(late, status.native2.targetB), before = await state();
      await late.getByRole('button', { name: '로그아웃', exact: true }).click(); await release(pending); await expect(stage(late)).toHaveCount(0); expect(await state()).toEqual(before);
    } finally { await lateContext.close(); }
    phases.push({ phase: 'actual logout before delayed real response; no late stage' });
    await info.attach('genuine-native2-phases', { body: JSON.stringify({ phases, requests: records.records,
      qualification: 'Genuine authority/API/privatePG/UI; fixture advance, client deadline and explicit real-response delay are controlled interventions. Unsupported native variant refusals retain separate source-bound controlled unit evidence; this actual corpus contains the three supported complete contexts.' }), contentType: 'application/json' });
  } finally { await privateControl({ action: 'native2-release' }); await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'viewer' }); await betaContext?.close(); }
});
