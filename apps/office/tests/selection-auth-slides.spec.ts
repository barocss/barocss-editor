import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import type { INode } from '../../../packages/datastore/src/types';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { privateControl, type RealStatus, type Inspection } from './helpers/real-recovery-control';

const origin = 'http://127.0.0.1:5191';
const workspace = (page: Page) => page.locator('[data-server-slides-workspace]');
const paragraphs = (page: Page) => workspace(page).locator('.sl-stage .w-paragraph');
const save = (page: Page) => workspace(page).getByRole('button', { name: /^(저장|저장 확인·재시도)$/ });
const saved = (page: Page) => workspace(page).locator('[data-save-status]');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Alias = 'alpha-editor' | 'beta-viewer';
interface Pending {
  draftId: string; status: string; snapshotText: string; savedAt: string; scope: { subject: string };
  attempt?: { operation: 'create' | 'update'; idempotencyKey: string; snapshotText: string };
}
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.skip(!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE,
  'Slides acceptance requires the protected synthetic OIDC fixture and disposable PostgreSQL supervisor.');

async function login(page: Page, alias: Alias, url = origin, tenant: 'Alpha' | 'Beta' = 'Alpha') {
  await page.goto(url);
  await expect.poll(async () => await page.getByRole('button', { name: '일반 사용자로 들어가기' }).isVisible() ||
    await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() || await workspace(page).isVisible()).toBe(true);
  const button = page.getByRole('button', { name: '일반 사용자로 들어가기' });
  if (await button.isVisible()) {
    await button.click();
    const username = page.locator('#username');
    if (await username.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
      const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as {
        users: Record<string, { username?: string; password: string }>;
      };
      const account = fixture.users[alias]!;
      await username.fill(account.username ?? alias);
      await page.locator('#password').fill(account.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect.poll(async () => await page.getByRole('heading', { name: '회사를 선택하세요' }).isVisible() ||
    await workspace(page).isVisible()).toBe(true);
  if (!(await workspace(page).isVisible())) {
    await page.getByRole('button', { name: new RegExp(`Synthetic ${tenant}`) }).click();
    await page.getByRole('button', { name: `${tenant} workspace`, exact: true }).click();
    await page.getByRole('button', { name: 'Slides 자료', exact: true }).click();
    await page.getByRole('button', { name: '새 Slides 만들기', exact: true }).click();
  }
  await expect(workspace(page)).toBeVisible();
}
function track(page: Page) {
  const state = { bearer: '', writes: [] as Array<{ operation: 'create' | 'update'; body: Record<string, unknown> }> };
  page.on('request', request => {
    if (request.headers().authorization) state.bearer = request.headers().authorization;
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/documents$/.test(path)) state.writes.push({ operation: 'create', body: request.postDataJSON() });
    if (request.method() === 'PUT' && /\/snapshot$/.test(path)) state.writes.push({ operation: 'update', body: request.postDataJSON() });
  });
  return state;
}
async function seed(page: Page, title: string) {
  const name = randomUUID(), document = createSampleDeck();
  const surfaces = document.content!.filter((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
  const resources = document.content!.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources')!;
  surfaces[0].attributes = { ...surfaces[0].attributes, trackId: 'server-native-track' };
  surfaces[1].attributes = { ...surfaces[1].attributes, id: 'server-native-target' };
  surfaces[0].content!.push({ stype: 'rectangle', attributes: { name: 'server-native-jump', x: 0, y: 0, width: 100, height: 100, goTo: 'server-native-target' } });
  resources.content!.push({ stype: 'motionTrack', attributes: { id: 'server-native-track' }, content: [
    { stype: 'motionStep', attributes: { kind: 'build', effect: 'appear', target: 'server-native-jump' } }
  ] });
  const rectangle = randomUUID(), ellipse = randomUUID(), line = randomUUID();
  surfaces[0].content!.push(
    { stype: 'rectangle', attributes: { objectId: rectangle, name: 'attached-target', x: 1500, y: 8500, width: 3000, height: 1500 } },
    { stype: 'ellipse', attributes: { objectId: ellipse, name: 'attached-target', x: 9000, y: 9300, width: 3000, height: 1500 } },
    { stype: 'connector', attributes: { objectId: line, name: 'attached-line', startObjectId: rectangle, endObjectId: ellipse, startSide: 'e', endSide: 'w', kind: 'elbow', startX: 4500, startY: 9250, endX: 9000, endY: 10050 } },
    { stype: 'connector', attributes: { objectId: randomUUID(), name: 'attached-branch', startObjectId: rectangle, endObjectId: line, endT: 0.4, startSide: 's', kind: 'straight', startX: 3000, startY: 10000, endX: 7500, endY: 9500 } }
  );
  const richNote=resources.content!.find((node):node is INode=>typeof node!=='string'&&node.stype==='surfaceNote')!;
  (richNote.content![0] as INode).content![0]={stype:'inline-text',text:'The point of this slide is that nothing on it is new.',marks:[{stype:'bold',range:[0,2]}]};
  document.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const text = deckFileText(document, '2026-10-01T00:00:00.000Z');
  await page.evaluate(({ name, title, text }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('barocss-slides-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'name' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ name, title, text, count: 1, savedAt: 100,
        metadata: { favorite: true, purpose: 'Slides source-retention' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), { name, title, text });
  return { name, title, text, document: JSON.parse(text).document as INode };
}
async function records(page: Page): Promise<Pending[]> {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.slides.pending.v1:'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
}
async function prepare(page: Page, title: string) {
  await workspace(page).getByRole('button', { name: '이 기기의 로컬 문서 목록 확인' }).click();
  await workspace(page).getByRole('button', { name: `${title} · 새 서버 사본 준비`, exact: true }).click();
  await expect(save(page)).toBeEnabled();
  return (await records(page)).find(record => record.status === 'pending')!;
}
function inspect(documentId?: string, key?: string, operation: 'create' | 'update' = 'update', actor: Alias = 'alpha-editor') {
  return privateControl<Inspection<'slides'>>({ action: 'inspect', product: 'slides', ...(documentId ? { documentId } : {}),
    ...(key ? { idempotencyKey: key, operation, actor } : {}) });
}
async function canonical(page: Page, root: string, bearer: string, documentId: string, expected?: string) {
  const db = await inspect(documentId);
  expect(db.document).not.toBeNull();
  const response = await page.request.get(`${root}/documents/${documentId}`, { headers: { Authorization: bearer } });
  expect(response.status()).toBe(200);
  const api = await response.json();
  expect(api.snapshotText).toBe(db.document!.snapshotText);
  if (expected) expect(api.snapshotText).toBe(expected);
  expect(api.document.product).toBe('slides');
  expect(api.document.pageId).toBeNull();
  expect(api.document.revision).toBe(db.document!.revision);
  expect(api.document.tenantId).toBe(db.document!.tenantId);
  expect(api.document.workspaceId).toBe(db.document!.workspaceId);
  expect(api.document.metadataRevision).toBe(db.document!.metadataRevision);
  expect(hash(api.snapshotText)).toBe(db.document!.snapshotHash);
  expect(JSON.parse(api.snapshotText).document).toEqual(db.document!.canonicalTree);
  const surfaces = JSON.parse(api.snapshotText).document.content.filter((node: { stype: string }) => node.stype === 'surface');
  expect(surfaces.length).toBeGreaterThan(1);
  await expect(workspace(page).locator('.sl-filmstrip button[data-slide]')).toHaveCount(surfaces.length);
  await expect(workspace(page).locator('.sl-stage')).toContainText('One engine');
  return db;
}

async function downloadNative(page: Page, info: TestInfo, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), workspace(page).getByRole('button', { name: 'Slides 파일 내보내기', exact: true }).click()]);
  const path = info.outputPath(name); await download.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8')).document;
}
async function selectActualTitle(page: Page, readOnly = false) {
  if(readOnly) {
    const points=await paragraphs(page).filter({hasText:'One engine'}).first().evaluate(node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text:Node|null;while((text=walker.nextNode())) {if(text.textContent?.startsWith('One engine')) {const first=document.createRange(),last=document.createRange();first.setStart(text,0);first.setEnd(text,1);last.setStart(text,6);last.setEnd(text,7);const a=first.getBoundingClientRect(),b=last.getBoundingClientRect();return{x1:a.left+0.2,y:a.top+a.height/2,x2:b.right-0.2};}}throw new Error('title text glyphs missing');});
    await page.mouse.move(points.x1,points.y);await page.mouse.down();await page.mouse.move(points.x2,points.y,{steps:8});await page.mouse.up();await expect.poll(()=>page.evaluate(()=>getSelection()?.toString())).toBe('One eng');return;
  }
  const title = paragraphs(page).filter({ hasText: 'One engine' }).first();
  const box = (await title.boundingBox())!;
  await page.mouse.dblclick(box.x + 8, box.y + Math.min(10, box.height / 2));
  await page.keyboard.press('Meta+ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('One eng');
  // Authenticated workspaces deliberately expose no editor debug object. Wait for the rendered text target.
  await expect(workspace(page).locator('[data-slides-formatting] [data-group="align"]')).toHaveCount(0);
  await expect(workspace(page).locator('[data-slides-formatting] [data-group="character"]')).toBeVisible();
}

test('actual Slides writer and automatic viewer preserve complete native API/PG bytes and rich draft through current authority', async ({ browser }, info) => {
  test.setTimeout(180000);
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const writer = await a.newPage(), viewer = await b.newPage();
  const requests = track(writer), readerRequests = track(viewer);
  try {
    await login(writer, 'alpha-editor');
    const source = await seed(writer, 'Synthetic Slides selection review');
    await prepare(writer, source.title); await save(writer).click(); await expect(saved(writer)).toHaveText('서버 저장 확인됨');
    const url = writer.url(), id = new URL(url).searchParams.get('document')!;
    const status = await privateControl<RealStatus>({ action: 'status' }), root = `${origin}/api/v1/tenants/${status.tenantId}`;
    const confirmed = await canonical(writer, root, requests.bearer, id, source.text);
    expect(await downloadNative(writer, info, 'writer-initial.slides.json')).toEqual(source.document);
    const sheets=await writer.evaluate(()=>Array.from(document.querySelectorAll('.sl-slide')).map(node=>{const cs=getComputedStyle(node);return {thumb:!!node.closest('.sl-thumb'),rect:node.getBoundingClientRect().toJSON(),width:cs.width,maxWidth:cs.maxWidth,margin:cs.margin,inline:node.getAttribute('style')};}));
    writeFileSync(info.outputPath('native-sheet-after-computed.json'),JSON.stringify(sheets,null,2));
    for(const sheet of sheets) {expect(sheet.maxWidth).toBe('none'); expect(sheet.margin).toBe('0px'); expect(sheet.width).toBe('1280px');}
    for (const theme of ['light', 'dark']) {
      await writer.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await writer.screenshot({ path: info.outputPath(`${theme}-writer-idle.png`), animations: 'disabled' });
      await selectActualTitle(writer);
      const tools = workspace(writer).locator('[data-slides-formatting]');
      await expect(tools).toBeVisible(); await expect(tools).toBeInViewport({ ratio: 1 });
      const geometry = await tools.evaluate(node => ({ box: node.getBoundingClientRect().toJSON(), anchor: getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON() }));
      writeFileSync(info.outputPath(`${theme}-selected-geometry.json`),JSON.stringify(geometry,null,2));
      await writer.screenshot({path:info.outputPath(`${theme}-selected-geometry.png`),animations:'disabled'});
      // The independent mandatory visual schedule below retains the strict anchor assertion.
      expect(await tools.locator('button:not([disabled])').first().evaluate(node => {
        const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
      await writer.screenshot({ path: info.outputPath(`${theme}-writer-selected.png`), animations: 'disabled' });
      await writer.keyboard.press('Escape'); await expect(tools).toHaveCount(0);
    }
    await login(viewer, 'beta-viewer', url);
    await expect(workspace(viewer).locator('[contenteditable=true]')).toHaveCount(0);
    await expect(save(viewer)).toHaveCount(0);
    expect(await downloadNative(viewer, info, 'viewer-initial.slides.json')).toEqual(source.document);
    await selectActualTitle(viewer,true); await viewer.keyboard.press('Meta+c');
    await expect(workspace(viewer).locator('[data-slides-formatting]')).toHaveCount(0);
    await viewer.keyboard.press('Meta+x'); await viewer.keyboard.insertText('FORBIDDEN SLIDES INPUT'); await viewer.keyboard.press('Backspace');
    await viewer.keyboard.press('Meta+z'); await viewer.keyboard.press('Meta+Shift+z'); await viewer.keyboard.press('Meta+b');
    // These two events are explicit browser simulations, not OS clipboard or drag claims.
    await paragraphs(viewer).filter({ hasText: 'One engine' }).first().evaluate(node => {
      const data = new DataTransfer(); data.setData('text/plain', 'FORBIDDEN SLIDES PASTE'); data.setData('text/html', '<strong>FORBIDDEN SLIDES PASTE</strong>');
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      const drop = new DataTransfer(); drop.setData('text/plain', 'FORBIDDEN SLIDES DROP'); drop.setData('text/html', '<p>FORBIDDEN SLIDES DROP</p>');
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drop }));
    });
    await expect(workspace(viewer)).not.toContainText('FORBIDDEN SLIDES');
    await viewer.locator('.sl-topbar').getByRole('button', { name: '자세한 속성', exact: true }).click();
    await expect(workspace(viewer).getByRole('complementary', { name: '속성', exact: true })).toBeVisible();
    await workspace(viewer).getByLabel('단위', { exact: true }).selectOption('in');
    await viewer.locator('.sl-topbar').getByRole('button', { name: '자세한 속성', exact: true }).click();
    await viewer.getByRole('button', { name: '발표', exact: true }).click(); await expect(viewer.locator('.sl-present-hint')).toBeVisible();
    await viewer.keyboard.press('Escape'); await expect(viewer.locator('.sl-present-hint')).toHaveCount(0);
    await viewer.locator('.sl-filmstrip button').nth(1).click(); await expect(workspace(viewer)).toContainText('The point of this slide');
    for (const theme of ['light', 'dark']) {
      await viewer.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await viewer.screenshot({ path: info.outputPath(`${theme}-automatic-viewer.png`), animations: 'disabled' });
    }
    expect(await downloadNative(viewer, info, 'viewer-after-attacks.slides.json')).toEqual(source.document);
    expect(readerRequests.writes).toHaveLength(0);
    const afterReader = await canonical(viewer, root, readerRequests.bearer, id, source.text);
    expect(afterReader.document!.revision).toBe(confirmed.document!.revision);
    // The lifecycle focus event is synthetic. OIDC, permission checks, API and PostgreSQL are real.
    const recheck = async () => { const response = viewer.waitForResponse(r => r.url().includes(`/documents/${id}`) && r.request().method() === 'GET'); await viewer.evaluate(() => window.dispatchEvent(new Event('focus'))); await response; };
    await privateControl({ action: 'beta-role', role: 'editor' }); await recheck();
    await expect(workspace(viewer).locator('[contenteditable=true]').first()).toBeVisible();
    const note = workspace(viewer).locator('.sl-notes-host .w-paragraph').filter({hasText:'The point of this slide is that nothing on it is new.'}).first();
    await note.click(); await viewer.keyboard.press('Meta+ArrowRight'); await viewer.keyboard.insertText(' LATEST RICH NOTE');
    await expect(note).toContainText('LATEST RICH NOTE');
    await expect.poll(async () => (await records(viewer)).some(record => record.snapshotText.includes('LATEST RICH NOTE'))).toBe(true);
    const draft = (await records(viewer)).find(record => record.snapshotText.includes('LATEST RICH NOTE'))!;
    const draftNative = await downloadNative(viewer, info, 'current-writer-draft.slides.json');
    const expectedDraft=JSON.parse(JSON.stringify(source.document));const append=(node:INode)=>{if(node.text==='The point of this slide is that nothing on it is new.')node.text+=' LATEST RICH NOTE';for(const child of node.content??[])if(typeof child!=='string')append(child);};append(expectedDraft);expect(draftNative).toEqual(expectedDraft);
    await privateControl({ action: 'beta-role', role: 'viewer' }); await recheck();
    await expect(workspace(viewer).locator('[contenteditable=true]')).toHaveCount(0);
    await expect(workspace(viewer)).toContainText('LATEST RICH NOTE');
    expect(await downloadNative(viewer, info, 'demoted-draft.slides.json')).toEqual(draftNative);
    expect((await records(viewer)).find(record => record.snapshotText.includes('LATEST RICH NOTE'))!.snapshotText).toBe(draft.snapshotText);
    await privateControl({ action: 'beta-role', role: 'editor' }); await recheck();
    await expect(workspace(viewer).locator('[contenteditable=true]').first()).toBeVisible();
    await expect(workspace(viewer)).toContainText('LATEST RICH NOTE');
    expect(await downloadNative(viewer, info, 'promoted-draft.slides.json')).toEqual(draftNative);
    await note.click();await viewer.keyboard.press('Meta+z');expect(await downloadNative(viewer,info,'current-role-undo.slides.json')).toEqual(source.document);await viewer.keyboard.press('Meta+Shift+z');expect(await downloadNative(viewer,info,'current-role-redo.slides.json')).toEqual(draftNative);
    expect((await inspect(id)).document!.snapshotText).toBe(source.text); expect((await inspect(id)).document!.revision).toBe(confirmed.document!.revision); expect(readerRequests.writes).toHaveLength(0);
    await privateControl({ action: 'beta-active', active: false });
    const denied = await viewer.request.get(`${root}/documents/${id}`, { headers: { Authorization: readerRequests.bearer } }); expect(denied.status()).toBe(403);
    await viewer.reload(); await expect(workspace(viewer).locator('[contenteditable=true]')).toHaveCount(0);
    expect((await inspect(id)).document!.snapshotText).toBe(source.text);
    await info.attach('canonical-viewer-evidence.json', { body: JSON.stringify({ realPG: true, sourceHash: hash(source.text), revision: confirmed.document!.revision, readerWrites: readerRequests.writes.length }), contentType: 'application/json' });
  } finally {
    await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'viewer' }); await a.close(); await b.close();
  }
});


test('actual authenticated selection tools stay near their owned range in both themes',async({browser},info)=>{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 try {await login(page,'alpha-editor');const source=await seed(page,'Synthetic auth selection geometry');await prepare(page,source.title);await save(page).click();await expect(saved(page)).toHaveText('서버 저장 확인됨');
 for(const theme of ['light','dark']) {await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await selectActualTitle(page);const tools=workspace(page).locator('[data-slides-formatting]');await expect(tools).toBeVisible();await expect(tools).toBeInViewport({ratio:1});
 const geometry=await tools.evaluate(node=>{const box=node.getBoundingClientRect().toJSON(),anchor=getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON();const ancestry=[];let el:Element|null=node;while(el){const cs=getComputedStyle(el);ancestry.push({tag:el.tagName,className:el.className,rect:el.getBoundingClientRect().toJSON(),position:cs.position,transform:cs.transform,maxWidth:cs.maxWidth,margin:cs.margin,overflow:cs.overflow,height:cs.height});el=el.parentElement;}return{box,anchor,rangeRects:Array.from(getSelection()!.getRangeAt(0).getClientRects()).map(r=>r.toJSON()),style:node.getAttribute('style'),groups:Array.from(node.querySelectorAll('[data-group]')).map(el=>el.getAttribute('data-group')),ancestry};});
 writeFileSync(info.outputPath(`${theme}-geometry.json`),JSON.stringify(geometry,null,2));await page.screenshot({path:info.outputPath(`${theme}-geometry.png`),animations:'disabled'});
 expect(Math.min(Math.abs(geometry.box.bottom-geometry.anchor.top),Math.abs(geometry.box.top-geometry.anchor.bottom))).toBeLessThanOrEqual(20);await page.keyboard.press('Escape');}
 expect(await downloadNative(page,info,'geometry-tools-only.slides.json')).toEqual(source.document);
 } finally {await context.close();}
});
