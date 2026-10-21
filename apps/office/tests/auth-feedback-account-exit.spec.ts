import { projectFeedbackAction } from './project-feedback-menu.helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSampleDocument } from '../../../packages/office-word/src/sample-document';
import { wordFileText } from '../../../packages/office-word/src/word-file';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import { noteTreeOf, openNoteTree } from '../../../packages/office-note/src/session';
import { serializeNoteFile } from '../../../packages/office-note/src/note-file-codec';

const id = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const pageId = '00000000-0000-4000-8000-000000000005';
const snapshotText = JSON.stringify({ format: 'barocss-note', version: 1,
  document: { stype: 'note', attributes: { title: 'Alpha Note', pageId },
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Mock body' }] }] } });
const documentHead = { documentId, tenantId: id, workspaceId, product: 'note', title: 'Alpha Note',
  metadataRevision: 1, mode: 'snapshot', revision: 1, pageId,
  documentKey: `wonffice-${id}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 1,
  snapshotHash: createHash('sha256').update(snapshotText).digest('hex') };
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const officeOrigin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
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
    body: JSON.stringify(apiStatus === 200 ? { issuer, subject: 'synthetic-user', tenants: tenants ? [{ tenantId: id, name: 'Alpha Company', role }] : [], nextCursor: null } : { status: 'service_unavailable' }),
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

const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
type MixedProduct = 'note' | 'word' | 'slides';
async function controlledMixedWorkspace(page: Page, role: 'editor' | 'viewer', options: { project?: boolean; secondNote?: boolean; secondWord?: boolean } = {}) {
  await mockLogin(page, { role });
  const wordId = '00000000-0000-4000-8000-000000000021';
  const slidesId = '00000000-0000-4000-8000-000000000022';
  const siteId = '00000000-0000-4000-8000-000000000023';
  // Same rich Note structure as the real recovery schedule: marks, self-reference, code and table.
  const note = { stype: 'note', attributes: { title: 'Mixed rich Note', pageId }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Matrix structured body', marks: [{ stype: 'bold', range: [0, 6] }] },
      { stype: 'pageReference', attributes: { pageId, title: 'Self' } }] },
    { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [{ stype: 'inline-text', text: 'const matrix = true;' }] },
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
      { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Matrix cell' }] }
    ] }] }] }
  ] };
  // Produce the server bytes through the same native Note session serializer.
  // Its full node fields must already match the viewer's read-only native body.
  const noteSession = openNoteTree(note);
  let noteText: string;
  try {
    const nativeNote = noteTreeOf({ getNode: sid => noteSession.editor.dataStore.getNode(sid) as never }, noteSession.rootId)!;
    const canonicalNote = { ...note, stype: 'note' as const, content: nativeNote.content as unknown[] };
    expect(canonicalNote).toMatchObject(note);
    noteText = serializeNoteFile(canonicalNote, { savedAt: '2026-10-01T00:00:00Z' });
  } finally { noteSession.close(); }
  const word = createSampleDocument(), slides = createSampleDeck();
  for (const native of [word, slides]) native.metadata = { originalOwner: 'synthetic-A', loadedAt: 'original-native-loadedAt' };
  const texts = {
    note: noteText,
    word: wordFileText(word, '2026-10-01T00:00:00.000Z'),
    slides: deckFileText(slides, '2026-10-01T00:00:00.000Z')
  };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const originals = new Map((['note', 'word', 'slides'] as const).map(product => {
    const originalId = product === 'note' ? documentId : product === 'word' ? wordId : slidesId;
    return [originalId, { product, text: texts[product], head: { ...documentHead, documentId: originalId,
      product, title: `Mixed rich ${product === 'note' ? 'Note' : product === 'word' ? 'Word' : 'Slides'}`,
      pageId: product === 'note' ? pageId : null, documentKey: `wonffice-${id}-${originalId}`,
      fileFormat: `barocss-${product}`, fileVersion: JSON.parse(texts[product]).version, snapshotHash: hash(texts[product]) } }];
  }));
  const secondNoteId = '00000000-0000-4000-8000-000000000024';
  if (options.secondNote) {
    const targetNote = structuredClone(JSON.parse(noteText).document);
    targetNote.attributes.title = 'Second rich Note';
    targetNote.attributes.pageId = '00000000-0000-4000-8000-000000000025';
    targetNote.content[0].content[0].text = 'Target structured body';
    targetNote.content[0].content[1].attributes.pageId = targetNote.attributes.pageId;
    const text = serializeNoteFile(targetNote, { savedAt: '2026-10-01T00:00:00Z' });
    originals.set(secondNoteId, { product: 'note', text, head: { ...documentHead,
      documentId: secondNoteId, product: 'note', title: 'Second rich Note', pageId: targetNote.attributes.pageId,
      fileVersion: JSON.parse(text).version,
      documentKey: `wonffice-${id}-${secondNoteId}`, snapshotHash: hash(text) } });
  }
  const secondWordId = '00000000-0000-4000-8000-000000000026';
  if (options.secondWord) {
    const targetWord = structuredClone(word);
    const text = wordFileText(targetWord, '2026-10-01T00:00:00.000Z');
    originals.set(secondWordId, { product: 'word', text, head: { ...documentHead,
      documentId: secondWordId, product: 'word', title: 'Second rich Word', pageId: null,
      fileFormat: 'barocss-word', fileVersion: JSON.parse(text).version,
      documentKey: `wonffice-${id}-${secondWordId}`, snapshotHash: hash(text) } });
  }
  // Site is only an authorized catalog head. This test supplies no native Site body or editor contract.
  const siteHead = { ...documentHead, documentId: siteId, product: 'site', title: 'Unsupported Site original', pageId: null,
    documentKey: `wonffice-${id}-${siteId}`, fileFormat: 'barocss-site', snapshotHash: hash('controlled unsupported Site head') };
  const writes: Array<{ product: MixedProduct; documentId: string; expectedRevision: number; snapshotText: string; idempotencyKey: string }> = [];
  const reads: string[] = [], servedSnapshots: Array<{ documentId: string; snapshotText: string }> = [], receipts = new Map<string, unknown>();
  const gates = new Map<string, { read: number; pending: Promise<void> }>();
  let deniedTarget = false;
  let sourceWriteGate: { write: number; pending: Promise<void> } | undefined;
  const holdSourceWrite = (nextWrite = 1) => {
    let release!: () => void;
    sourceWriteGate = { write: writes.filter(write => write.product === 'note').length + nextWrite, pending: new Promise<void>(resolve => { release = resolve; }) };
    return () => { sourceWriteGate = undefined; release(); };
  };
  const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.unroute(`**/api/v1/tenants/${id}/documents?**`);
  await page.route(`**/api/v1/tenants/${id}/documents?**`, route => {
    const product = new URL(route.request().url()).searchParams.get('product');
    return route.fulfill(json({ documents: [...[...originals.values()].map(value => value.head), ...(product === null ? [siteHead] : [])]
      .filter(head => !product || head.product === product).sort((a, b) => a.documentId.localeCompare(b.documentId)), nextCursor: null }));
  });
  await page.unroute(`**/api/v1/tenants/${id}/documents/${documentId}`);
  for (const [originalId, original] of originals) {
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}`, async route => {
      reads.push(originalId);
      const gate = gates.get(originalId);
      if (gate?.read === reads.filter(value => value === originalId).length) await gate.pending;
      if (originalId === wordId && deniedTarget) return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
      servedSnapshots.push({ documentId: originalId, snapshotText: original.text });
      return route.fulfill(json({ document: original.head, snapshotText: original.text }));
    });
    await page.route(`**/api/v1/tenants/${id}/documents/${originalId}/snapshot`, async route => {
      const body = route.request().postDataJSON();
      expect(role).toBe('editor'); expect(body.expectedRevision).toBe(original.head.revision);
      expect(body.idempotencyKey).toEqual(expect.any(String));
      writes.push({ product: original.product, documentId: originalId, ...body });
      const gate = sourceWriteGate;
      if (original.product === 'note' && gate?.write === writes.filter(write => write.product === 'note').length) await gate.pending;
      original.text = body.snapshotText;
      original.head = { ...original.head, revision: original.head.revision + 1, snapshotHash: hash(original.text) };
      const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey,
        requestHash: hash(JSON.stringify(['update', originalId, body.expectedRevision, body.snapshotText])), document: original.head, snapshotText: original.text };
      receipts.set(body.idempotencyKey, receipt);
      return route.fulfill(json(receipt));
    });
  }
  await page.route(`**/api/v1/tenants/${id}/documents/${siteId}`, route => {
    reads.push(siteId); return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
  });
  await page.route(`**/api/v1/tenants/${id}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  const projectId = '00000000-0000-4000-8000-000000000031', projectActor = 'synthetic-member';
  const sourceProduct = options.secondWord ? 'word' : 'note', sourceId = options.secondWord ? wordId : documentId;
  const feedbackKey = `${projectActor}:feedback:${sourceProduct}:${sourceId}`;
  let projectRevision = 1;
  const projectRecord = { id: projectId, title: 'Mixed native Project', goal: '', archived: false,
    comments: [], works: [], activities: [], drafts: { [feedbackKey]: 'Initial controlled project draft' } as Record<string, string>,
    results: [{ id: 'mixed-note-result', name: 'Mixed rich Note', document: { product: sourceProduct, id: sourceId }, inputs: [] }] };
  const projectWrites: Array<{ expectedRevision: number; idempotencyKey: string; action: { type: string; key: string; text: string } }> = [];
  if (options.project) {
    const projectValue = () => ({ tenantId: id, workspaceId, actor: { kind: 'human', id: projectActor }, project: { revision: projectRevision, record: projectRecord } });
    await page.route(`**/api/v1/tenants/${id}/projects?**`, route => route.fulfill(json({ projects: [projectValue()], nextCursor: null })));
    await page.route(`**/api/v1/tenants/${id}/projects/${projectId}`, route => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        expect(body.expectedRevision).toBe(projectRevision); expect(body.idempotencyKey).toEqual(expect.any(String));
        expect(body.action.type).toBe('draft'); expect(body.action.key).toBe(`feedback:${sourceProduct}:${sourceId}`);
        projectWrites.push(body); projectRecord.drafts[feedbackKey] = body.action.text; projectRevision++;
      }
      return route.fulfill(json(projectValue()));
    });
  }
  await page.goto(`/?tenant=${id}&workspace=${workspaceId}&document=${sourceId}&product=${sourceProduct}${options.project ? `&project=${projectId}` : ''}`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
  const shell = (product: MixedProduct) => page.locator(`[data-server-${product}-workspace]`);
  if (options.secondWord) await expect(shell('word').locator('.w-shell-document')).toBeVisible();
  else await expect(shell('note').locator('.on-doc > p').first()).toContainText('Matrix structured body');
  await expect(page.locator('.ow-file-navigation')).toBeVisible(); await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  const hold = (originalId: string, nextRead = 1) => {
    let release!: () => void;
    const read = reads.filter(value => value === originalId).length + nextRead;
    gates.set(originalId, { read, pending: new Promise<void>(resolve => { release = resolve; }) });
    return () => { gates.delete(originalId); release(); };
  };
  return { wordId, slidesId, siteId, secondNoteId, secondWordId, originals, texts, writes, reads, servedSnapshots, shell, hold, holdSourceWrite, projectRecord, projectWrites, feedbackKey, projectId, denyWord: (denied: boolean) => { deniedTarget = denied; } };
}
// Change only the declared editable text. All canonical native fields stay in
// the expected document, including marks, reference, code, table and attributes.
function expectedMixedNote(text: string, ...suffixes: string[]) {
  const expected = JSON.parse(text).document;
  expect(expected.content[0].content[0].stype).toBe('inline-text');
  expected.content[0].content[0].text += suffixes.join('');
  return expected;
}
async function expectProtectedMixedNote(page: Page, status: 'draft' | 'confirmed', expected: unknown) {
  await expect.poll(() => page.evaluate(({ status, expected }) => Object.keys(localStorage)
    .filter(key => key.startsWith('wonffice.note.pending.v1:')).some(key => {
      const record = JSON.parse(localStorage.getItem(key)!);
      return record.status === status && JSON.stringify(JSON.parse(record.snapshotText).document) === JSON.stringify(expected);
    }), { status, expected })).toBe(true);
}
// Hit the last editable glyph, before the atomic Self reference. A paragraph
// center click followed by End can instead move the caret to the later table.
async function placeMixedNoteCaret(page: Page, paragraph: Locator) {
  const glyph = await paragraph.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Text | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent && !node.parentElement?.closest('[contenteditable="false"]')) last = node as Text;
    }
    if (!last) throw new Error('Expected an editable native Note text leaf');
    const range = document.createRange();
    range.setStart(last, last.length - 1); range.setEnd(last, last.length);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('Expected a visible native Note glyph');
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, leaf: last.data };
  });
  await page.mouse.click(glyph.x, glyph.y);
  const remaining = await paragraph.evaluate((element, leaf) => {
    const selection = getSelection(), node = selection?.anchorNode;
    if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !element.contains(node)
      || node.parentElement?.closest('[contenteditable="false"]') || node.textContent !== leaf) {
      throw new Error('The real glyph hit did not place an editable Note caret');
    }
    return leaf.length - selection.anchorOffset;
  }, glyph.leaf);
  expect(remaining).toBeGreaterThanOrEqual(0); expect(remaining).toBeLessThanOrEqual(1);
  if (remaining) await page.keyboard.press('ArrowRight');
  await expect.poll(() => paragraph.evaluate((element, leaf) => {
    const selection = getSelection(), node = selection?.anchorNode;
    return Boolean(selection?.isCollapsed && node?.nodeType === Node.TEXT_NODE && element.contains(node)
      && !node.parentElement?.closest('[contenteditable="false"]') && node.textContent === leaf && selection.anchorOffset === leaf.length);
  }, glyph.leaf)).toBe(true);
}
async function appendMixedNoteInput(page: Page, paragraph: Locator, text: string) {
  await placeMixedNoteCaret(page, paragraph);
  await page.keyboard.insertText(text);
  await expect(paragraph).toContainText(text.trim());
}

async function openNoteTaskPanel(page: Page) {
  const toggle = page.getByRole('button', { name: 'Note 작업', exact: true });
  const panel = page.getByRole('complementary', { name: 'Note 작업', exact: true });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
  return panel;
}

// Controlled OIDC/API, actual mounted AuthApp/ProjectFeedback/native Note.
// Hold a real user-initiated snapshot write. Logout must settle it, never retry it.
for (const late of ['unchanged', 'input', 'composition', 'failed-save'] as const) test(`logout checks Project feedback ${late} after actual held native exit`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true });
  const sourceURL = page.url(), source = state.shell('note');
  const panel = await openNoteTaskPanel(page);
  const composer = panel.getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const originalComposer = await composer.elementHandle();
  const originalProject = structuredClone(state.projectRecord);
  await appendMixedNoteInput(page, source.locator('.on-doc > p').first(), ' protected-account-exit');
  const expected = expectedMixedNote(state.texts.note, ' protected-account-exit');
  await expectProtectedMixedNote(page, 'draft', expected);
  let releaseNative!: () => void, nativeWrites = 0, logoutRequests = 0;
  const nativeHeld = new Promise<void>(resolve => { releaseNative = resolve; });
  let fixedAttempt: unknown;
  await page.route(`**/api/v1/tenants/${id}/documents/${documentId}/snapshot`, async route => {
    nativeWrites++; fixedAttempt = route.request().postDataJSON();
    await nativeHeld;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'service_unavailable' }) });
  });
  page.on('request', request => { if (request.url().startsWith(`${issuer}/protocol/openid-connect/logout`)) logoutRequests++; });
  let releaseFeedback: (() => void) | undefined;
  try {
    await source.getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => nativeWrites).toBe(1);
    const fixedRows = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
    await page.evaluate(async module => {
      const { productDocumentHost } = await import(module);
      const host = productDocumentHost();
      if (!host?.beforeAccountExit) throw new Error('Expected a real native account-exit boundary');
      const original = host.beforeAccountExit.bind(host);
      const proof = { entered: 0, settled: false, result: false };
      (window as Window & { accountExitProof?: typeof proof }).accountExitProof = proof;
      host.beforeAccountExit = async () => {
        proof.entered++;
        const result = await original();
        proof.result = result; proof.settled = true;
        return result;
      };
    }, sharedModule);
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { accountExitProof?: { entered: number } }).accountExitProof?.entered)).toBe(1);
    expect(await page.evaluate(() => (window as Window & { accountExitProof?: { settled: boolean } }).accountExitProof?.settled)).toBe(false);
    // Feedback preparation has completed; the real native boundary awaits its fixed write.
    await expect(source).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    if (late === 'failed-save') {
      const held = new Promise<void>(resolve => { releaseFeedback = resolve; });
      await page.route(`**/api/v1/tenants/${id}/projects/${state.projectId}`, async route => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        await held;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'service_unavailable' }) });
      });
    }
    if (late === 'unchanged') {
      releaseNative();
      await expect(page.getByRole('heading', { name: 'Wonffice에 들어가기', exact: true })).toBeVisible();
      await expect(source).toHaveCount(0); await expect(composer).toHaveCount(0);
      expect(logoutRequests).toBe(1); expect(nativeWrites).toBe(1);
      expect(state.projectRecord).toEqual(originalProject); expect(state.projectWrites).toHaveLength(0);
      expect(state.originals.get(documentId)!.text).toBe(state.texts.note);
      const retained = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
      expect(retained).toEqual(fixedRows);
      expect(JSON.parse((fixedAttempt as { snapshotText: string }).snapshotText).document).toEqual(expected);
      return;
    }
    await composer.click(); await page.keyboard.press('End');
    if (late === 'composition') await composer.dispatchEvent('compositionstart', { data: '' });
    if (late !== 'composition') await page.keyboard.insertText(' latest feedback during account exit');
    const latest = late === 'composition' ? 'Initial controlled project draft' : 'Initial controlled project draft latest feedback during account exit';
    await expect(composer).toHaveValue(latest);
    if (late !== 'failed-save') await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe(latest);
    releaseFeedback?.();
    if (late === 'failed-save') await expect(panel.getByText('요청을 보관하지 못했습니다', { exact: true })).toBeVisible();
    releaseNative();
    await expect(page.getByRole('alert').filter({ hasText: /저장|보관|이동|문서/ }).first()).toBeVisible();
    await expect(source).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    expect(await originalComposer!.evaluate(node => node.isConnected)).toBe(true);
    await expect(composer).toHaveValue(latest);
    expect(logoutRequests).toBe(0); expect(nativeWrites).toBe(1);
    expect(state.originals.get(documentId)!.text).toBe(state.texts.note);
    const retainedRows = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
    expect(retainedRows).toEqual(fixedRows);
    expect(await page.evaluate(() => (window as Window & { accountExitProof?: { settled: boolean; result: boolean } }).accountExitProof)).toMatchObject({ settled: true, result: true });
    expect(fixedAttempt).toMatchObject({ expectedRevision: 1, snapshotText: expect.any(String), idempotencyKey: expect.any(String) });
    expect(JSON.parse((fixedAttempt as { snapshotText: string }).snapshotText).document).toEqual(expected);
    expect(state.projectRecord).toEqual(late === 'failed-save' ? originalProject : { ...originalProject, drafts: { ...originalProject.drafts, [state.feedbackKey]: latest } });
  } finally { releaseNative(); releaseFeedback?.(); await originalComposer!.dispose(); }
});

async function observeActualNativeNavigation(page: Page, method: 'beforeNavigate' | 'beforeAccountExit' = 'beforeNavigate') {
  await page.evaluate(async ({ module, method }) => {
    const { productDocumentHost } = await import(module);
    const host = productDocumentHost();
    if (!host?.[method]) throw new Error('Expected actual native navigation preparation');
    const original = host[method]!.bind(host);
    const proof = { entered: 0, settled: 0, result: false };
    (window as Window & { nativeNavigationProof?: typeof proof }).nativeNavigationProof = proof;
    host[method] = async () => {
      proof.entered++;
      const result = await original();
      proof.result = result; proof.settled++;
      return result;
    };
  }, { module: sharedModule, method });
}
async function nativeNavigationProof(page: Page) {
  return page.evaluate(() => (window as Window & { nativeNavigationProof?: { entered: number; settled: number; result: boolean } }).nativeNavigationProof);
}

for (const late of ['unchanged', 'feedback-input', 'native-composition'] as const) test(`tree library return checks ${late} after the actual catalog read`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true });
  const source = state.shell('note'), sourceURL = page.url();
  const panel = await openNoteTaskPanel(page);
  const composer = panel.getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const originalComposer = await composer.elementHandle();
  await observeActualNativeNavigation(page, 'beforeAccountExit');
  let releaseCatalog!: () => void, catalogReads = 0;
  const held = new Promise<void>(resolve => { releaseCatalog = resolve; });
  await page.route(`**/api/v1/tenants/${id}/documents?**`, async route => {
    if (new URL(route.request().url()).searchParams.get('product') !== 'note') return route.fallback();
    catalogReads++; await held; return route.fallback();
  });
  try {
    await page.locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true }).click();
    await expect.poll(() => catalogReads).toBe(1);
    expect(await nativeNavigationProof(page)).toEqual({ entered: 1, settled: 1, result: true });
    await expect(source).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    const latest = 'Initial controlled project draft latest feedback during catalog read';
    if (late === 'feedback-input') {
      await composer.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' latest feedback during catalog read');
      await expect(composer).toHaveValue(latest);
      await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe(latest);
    } else if (late === 'native-composition') {
      await appendMixedNoteInput(page, source.locator('.on-doc > p').first(), ' retained-catalog-last-input');
      await expectProtectedMixedNote(page, 'draft', expectedMixedNote(state.texts.note, ' retained-catalog-last-input'));
      await source.locator('.on-doc').dispatchEvent('compositionstart', { data: '' });
    }
    await expect(page.locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true })).toBeDisabled();
    releaseCatalog();
    await expect(page.locator('.ow-tree-footer').getByRole('button', { name: '자료함', exact: true })).toBeEnabled();
    if (late === 'unchanged') {
      await expect(source).toHaveCount(0); await expect(composer).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/${workspaceId}\\?tenant=${id}&view=library$`));
      expect((await nativeNavigationProof(page))?.result).toBe(true);
      expect(state.originals.get(documentId)!.text).toBe(state.texts.note); expect(state.writes).toHaveLength(0); expect(state.projectWrites).toHaveLength(0);
      return;
    }
    await expect(source).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    await expect(page.getByRole('alert').filter({ hasText: /이동|문서|입력|저장/ }).first()).toBeVisible();
    expect(await originalComposer!.evaluate(node => node.isConnected)).toBe(true);
    await expect(composer).toHaveValue(late === 'feedback-input' ? latest : 'Initial controlled project draft');
    expect(state.originals.get(documentId)!.text).toBe(state.texts.note); expect(state.writes).toHaveLength(0);
    if (late === 'native-composition') {
      await expect(source.locator('.on-doc > p').first()).toContainText('retained-catalog-last-input');
      await expectProtectedMixedNote(page, 'draft', expectedMixedNote(state.texts.note, ' retained-catalog-last-input'));
      await source.locator('.on-doc').dispatchEvent('compositionend', { data: '' });
    }
  } finally { releaseCatalog(); await originalComposer!.dispose(); }
});

for (const late of ['unchanged', 'feedback-input'] as const) test(`Project return checks ${late} while the actual native save prepares navigation`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true });
  const source = state.shell('note'), sourceURL = page.url();
  const panel = await openNoteTaskPanel(page);
  const composer = panel.getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const originalComposer = await composer.elementHandle();
  await appendMixedNoteInput(page, source.locator('.on-doc > p').first(), ' protected-project-return');
  const expected = expectedMixedNote(state.texts.note, ' protected-project-return');
  await expectProtectedMixedNote(page, 'draft', expected);
  const release = state.holdSourceWrite();
  try {
    await source.getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    await observeActualNativeNavigation(page);
    await page.getByRole('button', { name: '프로젝트로 돌아가기', exact: true }).click();
    await expect.poll(async () => (await nativeNavigationProof(page))?.entered).toBe(1);
    expect((await nativeNavigationProof(page))?.settled).toBe(0);
    const latest = 'Initial controlled project draft latest feedback during Project return';
    if (late === 'feedback-input') {
      await composer.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' latest feedback during Project return');
      await expect(composer).toHaveValue(latest);
      await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe(latest);
    }
    release();
    await expect.poll(async () => (await nativeNavigationProof(page))?.settled).toBe(1);
    expect((await nativeNavigationProof(page))?.result).toBe(true);
    if (late === 'unchanged') {
      await expect(source).toHaveCount(0); await expect(composer).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.projectId}\\?tenant=${id}$`));
      expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expected);
      await expectProtectedMixedNote(page, 'confirmed', expected);
      expect(state.writes).toHaveLength(1); expect(state.projectWrites).toHaveLength(0);
      return;
    }
    await expect(source).toBeVisible(); await expect(page).toHaveURL(sourceURL);
    await expect(page.getByRole('alert').filter({ hasText: /입력|저장|문서/ }).first()).toBeVisible();
    expect(await originalComposer!.evaluate(node => node.isConnected)).toBe(true);
    await expect(composer).toHaveValue(latest);
    expect(JSON.parse(state.originals.get(documentId)!.text).document).toEqual(expected);
    await expectProtectedMixedNote(page, 'confirmed', expected);
    expect(state.writes).toHaveLength(1); expect(state.projectWrites).toHaveLength(1);
  } finally { release(); await originalComposer!.dispose(); }
});


async function observeActualSameProductOpen(page: Page) {
  await page.evaluate(async module => {
    const { productDocumentHost } = await import(module);
    const host = productDocumentHost();
    if (!host?.requestOpen) throw new Error('Expected actual native same-product opening');
    const original = host.requestOpen.bind(host);
    const proof = { entered: 0, settled: 0, result: false };
    (window as Window & { sameProductOpenProof?: typeof proof }).sameProductOpenProof = proof;
    host.requestOpen = async (...args: Parameters<typeof original>) => {
      proof.entered++;
      const result = await original(...args);
      proof.result = Boolean(result); proof.settled++;
      return result;
    };
  }, sharedModule);
}
async function sameProductOpenProof(page: Page) {
  return page.evaluate(() => (window as Window & { sameProductOpenProof?: { entered: number; settled: number; result: boolean } }).sameProductOpenProof);
}

test('authenticated same-Note tree navigation returns to the exact original with browser Back and Forward', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const sourceURL = page.url();
  const tree = page.locator('.ow-file-navigation');
  const note = state.shell('note');
  const source = note.locator('.on-doc > p');
  await expect(source).toHaveCount(1);
  await expect(source).toContainText('Matrix structured body');
  await appendMixedNoteInput(page, source, ' saved before history traversal');
  await note.getByRole('button', { name: '저장', exact: true }).click();
  await expect(note.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const sourceText = state.originals.get(documentId)!.text;
  const writesBeforeTree = state.writes.length;
  const sourceNode = await source.elementHandle();
  const initialHistoryLength = await page.evaluate(() => history.length);
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.secondNoteId}\\?tenant=${id}$`));
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  expect(await sourceNode!.evaluate(node => node.isConnected)).toBe(false);
  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
  expect(state.originals.get(documentId)!.text).toBe(sourceText);
  expect(state.writes).toHaveLength(writesBeforeTree);
  await appendMixedNoteInput(page, note.locator('.on-doc > p'), ' saved before history traversal');
  await note.getByRole('button', { name: '저장', exact: true }).click();
  await expect(note.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const targetText = state.originals.get(state.secondNoteId)!.text;
  const writesBeforeHistory = state.writes.length;
  const targetNode = await note.locator('.on-doc').elementHandle();
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  expect(await targetNode!.evaluate(node => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
  expect(state.writes).toHaveLength(writesBeforeHistory);

  await page.goBack();
  await expect(page).toHaveURL(sourceURL);
  await expect(note.locator('.on-doc > p')).toContainText('Matrix structured body saved before history traversal');
  await expect(tree.getByRole('button', { name: 'Mixed rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
  expect(state.writes).toHaveLength(writesBeforeHistory);

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.secondNoteId}\\?tenant=${id}$`));
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body saved before history traversal');
  await expect(tree.getByRole('button', { name: 'Second rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.originals.get(documentId)!.text).toBe(sourceText);
  expect(state.originals.get(state.secondNoteId)!.text).toBe(targetText);
  expect(state.writes).toHaveLength(writesBeforeHistory);
});

test('authenticated Back restores the current Note cursor and draft when its save fails', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const tree = page.locator('.ow-file-navigation'), note = state.shell('note');
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const originalA = state.originals.get(documentId)!.text;
  await appendMixedNoteInput(page, note.locator('.on-doc > p'), ' settled before refusal');
  await note.getByRole('button', { name: '저장', exact: true }).click();
  await expect(note.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  const beforeFailure = state.originals.get(state.secondNoteId)!.text;
  await appendMixedNoteInput(page, note.locator('.on-doc > p'), ' blocked by failed save');
  const expectedDraft = expectedMixedNote(beforeFailure, ' blocked by failed save');
  await expectProtectedMixedNote(page, 'draft', expectedDraft);
  const atB = page.url(), historyLength = await page.evaluate(() => history.length);
  let refusedWrites = 0;
  const pattern = `**/api/v1/tenants/${id}/documents/${state.secondNoteId}/snapshot`;
  const refuse = (route: import('@playwright/test').Route) => {
    refusedWrites++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'service_unavailable' }) });
  };
  await page.route(pattern, refuse);
  try {
    await page.goBack();
    await expect.poll(() => refusedWrites).toBe(1);
    await expect(page).toHaveURL(atB);
    await expect(note.locator('.on-doc > p')).toContainText('Target structured body settled before refusal blocked by failed save');
    await expect.poll(() => page.evaluate(expected => Object.keys(localStorage)
      .filter(key => key.startsWith('wonffice.note.pending.v1:')).some(key =>
        JSON.stringify(JSON.parse(JSON.parse(localStorage.getItem(key)!).snapshotText).document) === JSON.stringify(expected)), expectedDraft)).toBe(true);
    await expect(tree.getByRole('button', { name: 'Second rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(state.originals.get(documentId)!.text).toBe(originalA);
    expect(state.originals.get(state.secondNoteId)!.text).toBe(beforeFailure);
  } finally { await page.unroute(pattern, refuse); }
  await note.getByRole('button', { name: '저장 확인·재시도', exact: true }).click();
  await expect(note.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${id}$`));
  await expect(note.locator('.on-doc > p')).toContainText('Matrix structured body');
});

test('authenticated Back does not reopen a Note whose current access is denied', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const tree = page.locator('.ow-file-navigation'), note = state.shell('note');
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const atB = page.url(), source = state.originals.get(documentId)!.text;
  const target = state.originals.get(state.secondNoteId)!.text;
  const writes = state.writes.length, length = await page.evaluate(() => history.length);
  let deniedReads = 0;
  const pattern = `**/api/v1/tenants/${id}/documents/${documentId}`;
  const deny = (route: import('@playwright/test').Route) => {
    deniedReads++;
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ status: 'forbidden' }) });
  };
  await page.route(pattern, deny);
  try {
    await page.goBack();
    await expect.poll(() => deniedReads).toBe(1);
    await expect(page).toHaveURL(atB);
    await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
    await expect(tree.getByRole('button', { name: 'Second rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect(state.originals.get(documentId)!.text).toBe(source);
    expect(state.originals.get(state.secondNoteId)!.text).toBe(target);
    expect(state.writes).toHaveLength(writes);
  } finally { await page.unroute(pattern, deny); }
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${documentId}\\?tenant=${id}$`));
  await expect(note.locator('.on-doc > p')).toContainText('Matrix structured body');
});

test('rapid Back then Forward retires the older authenticated Note target read', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const tree = page.locator('.ow-file-navigation'), note = state.shell('note');
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const atB = page.url(), target = state.originals.get(state.secondNoteId)!.text;
  const writes = state.writes.length, readsBefore = state.reads.filter(one => one === documentId).length;
  const release = state.hold(documentId);
  try {
    await page.goBack();
    await expect.poll(() => state.reads.filter(one => one === documentId).length).toBe(readsBefore + 1);
    await page.goForward();
  } finally { release(); }
  await expect(page).toHaveURL(atB);
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  await expect(tree.getByRole('button', { name: 'Second rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.originals.get(state.secondNoteId)!.text).toBe(target);
  expect(state.writes).toHaveLength(writes);
});

test('authenticated Back refuses a changed current principal and preserves the mounted Note', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const tree = page.locator('.ow-file-navigation'), note = state.shell('note');
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const atB = page.url(), target = state.originals.get(state.secondNoteId)!.text;
  const writes = state.writes.length;
  let changedReads = 0;
  const changed = (route: import('@playwright/test').Route) => {
    changedReads++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ issuer, subject: 'changed-user',
      tenants: [{ tenantId: id, name: 'Alpha Company', role: 'editor' }], nextCursor: null }) });
  };
  await page.route('**/api/v1/me', changed);
  try {
    await page.goBack();
    await expect.poll(() => changedReads).toBe(1);
    await expect(page).toHaveURL(atB);
    await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
    await expect(tree.getByRole('button', { name: 'Second rich Note 열기', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(state.originals.get(state.secondNoteId)!.text).toBe(target);
    expect(state.writes).toHaveLength(writes);
  } finally { await page.unroute('**/api/v1/me', changed); }
});

test('foreign browser history state cannot select an authenticated Note original', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const tree = page.locator('.ow-file-navigation'), note = state.shell('note');
  await tree.getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const atB = page.url(), target = state.originals.get(state.secondNoteId)!.text;
  const reads = state.reads.length, writes = state.writes.length;
  // Adversarial history data is only a negative input. It is not a simulated
  // successful tree action and must never grant a document or product identity.
  await page.evaluate(({ workspace, tenant }) => history.pushState({ foreign: true }, '',
    `/${workspace}/00000000-0000-4000-8000-000000000099?tenant=${tenant}`), { workspace: workspaceId, tenant: id });
  await page.goBack();
  await expect(page).toHaveURL(atB);
  await page.goForward();
  await expect(page.locator('#office-auth-curtain')).toBeVisible();
  await expect(page.locator('#office-auth-curtain')).toContainText('현재 문서를 유지합니다');
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  expect(state.reads).toHaveLength(reads);
  expect(state.writes).toHaveLength(writes);
  expect(state.originals.get(state.secondNoteId)!.text).toBe(target);
});

test('copied position metadata cannot authorize a different Note URL', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { secondNote: true });
  const note = state.shell('note');
  await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  const atB = page.url(), reads = state.reads.length, writes = state.writes.length;
  await page.evaluate(({ workspace, tenant }) => history.pushState(history.state, '',
    `/${workspace}/00000000-0000-4000-8000-000000000099?tenant=${tenant}`), { workspace: workspaceId, tenant: id });
  await page.goBack();
  await expect(page).toHaveURL(atB);
  await page.goForward();
  await expect(page.locator('#office-auth-curtain')).toBeVisible();
  await expect(page.locator('#office-auth-curtain')).toContainText('현재 문서를 유지합니다');
  await expect(note.locator('.on-doc > p')).toContainText('Target structured body');
  expect(state.reads).toHaveLength(reads);
  expect(state.writes).toHaveLength(writes);
});

for (const late of ['unchanged', 'input', 'composition', 'failed-save'] as const) test(`same-product tree open checks Project feedback ${late} after actual target read`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true, secondNote: true });
  const source = state.shell('note'), sourceURL = page.url();
  const panel = await openNoteTaskPanel(page);
  const composer = panel.getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const originalComposer = await composer.elementHandle();
  const originalBody = await source.locator('.on-doc').elementHandle();
  const sourceSuffix = ' source history before target read';
  await appendMixedNoteInput(page, source.locator('.on-doc > p').first(), sourceSuffix);
  const expected = expectedMixedNote(state.texts.note, sourceSuffix);
  await expectProtectedMixedNote(page, 'draft', expected);
  await source.getByRole('button', { name: '저장', exact: true }).click();
  await expect(source.locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
  await expectProtectedMixedNote(page, 'confirmed', expected);
  const originalText = state.originals.get(documentId)!.text, targetText = state.originals.get(state.secondNoteId)!.text;
  const sourceRows = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, value: localStorage.getItem(key) })));
  await observeActualSameProductOpen(page);
  const releaseTarget = state.hold(state.secondNoteId);
  let releaseFeedback: (() => void) | undefined;
  try {
    await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(one => one === state.secondNoteId).length).toBe(1);
    expect(await sameProductOpenProof(page)).toEqual({ entered: 1, settled: 0, result: false });
    await expect(page).toHaveURL(sourceURL);
    await expect(source.locator('.on-doc > p').first()).toContainText(sourceSuffix);
    if (late === 'failed-save') {
      const held = new Promise<void>(resolve => { releaseFeedback = resolve; });
      await page.route(`**/api/v1/tenants/${id}/projects/${state.projectId}`, async route => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        await held;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'service_unavailable' }) });
      });
    }
    const latest = late === 'unchanged' || late === 'composition' ? 'Initial controlled project draft' : 'Initial controlled project draft latest feedback during target read';
    if (late !== 'unchanged') {
      await composer.click(); await page.keyboard.press('End');
      if (late === 'composition') await composer.dispatchEvent('compositionstart', { data: '' });
      else await page.keyboard.insertText(' latest feedback during target read');
      await expect(composer).toHaveValue(latest);
      if (late === 'input') await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe(latest);
      releaseFeedback?.();
      if (late === 'failed-save') await expect(panel.getByText('요청을 보관하지 못했습니다', { exact: true })).toBeVisible();
    }
    releaseTarget();
    await expect(page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true })).toBeEnabled();
    await expect.poll(async () => (await sameProductOpenProof(page))?.settled).toBe(1);
    expect(state.originals.get(documentId)!.text).toBe(originalText);
    expect(JSON.parse(originalText).document).toEqual(expected);
    expect(state.originals.get(state.secondNoteId)!.text).toBe(targetText);
    expect(state.writes).toHaveLength(1);
    if (late === 'unchanged') {
      expect((await sameProductOpenProof(page))?.result).toBe(true);
      await expect(source.locator('.on-doc > p').first()).toContainText('Target structured body');
      await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.secondNoteId}\\?tenant=${id}$`));
      expect(await originalBody!.evaluate(node => node.isConnected)).toBe(false);
      expect(state.projectWrites).toHaveLength(0);
      return;
    }
    await expect(page).toHaveURL(sourceURL);
    expect((await sameProductOpenProof(page))?.result).toBe(false);
    await expect(source.locator('.on-doc > p').first()).toContainText(sourceSuffix);
    expect(await originalBody!.evaluate(node => node.isConnected)).toBe(true);
    expect(await originalComposer!.evaluate(node => node.isConnected)).toBe(true);
    await expect(composer).toHaveValue(latest);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wonffice.note.pending.v1:')).map(key => ({ key, value: localStorage.getItem(key) })))).toEqual(sourceRows);
    expect(state.projectWrites).toHaveLength(late === 'input' ? 1 : 0);
    if (late === 'composition') await composer.dispatchEvent('compositionend', { data: '' });
    // Undo the actual source command authored before target loading, then redo it.
    // This proves that refusal keeps that original history and the complete native tree.
    await placeMixedNoteCaret(page, source.locator('.on-doc > p').first());
    await page.keyboard.press('Meta+z');
    await expectProtectedMixedNote(page, 'draft', expectedMixedNote(state.texts.note));
    await page.keyboard.press('Meta+Shift+z');
    await expectProtectedMixedNote(page, 'draft', expected);
  } finally { releaseTarget(); releaseFeedback?.(); await originalComposer!.dispose(); await originalBody!.dispose(); }
});

// This holds parent completion after the real native requestOpen has installed
// its target. It does not claim to hold the child's readiness callback.
test('same-product parent completion retires the actual old feedback input at native host replacement', async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true, secondNote: true });
  const panel = await openNoteTaskPanel(page);
  const composer = panel.getByRole('textbox', { name: 'Note 수정 요청 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  const originalProject = structuredClone(state.projectRecord);
  const sourceText = state.originals.get(documentId)!.text, targetText = state.originals.get(state.secondNoteId)!.text;
  await page.evaluate(async module => {
    const { productDocumentHost } = await import(module), host = productDocumentHost();
    if (!host?.requestOpen) throw new Error('Expected actual native same-product opening');
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note 수정 요청 입력"]');
    if (!textarea || textarea.disabled) throw new Error('Expected owned editable source feedback');
    const original = host.requestOpen.bind(host);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const proof = { installed: false, settled: false, retired: [] as Array<{ connected: boolean; disabled: boolean; value: string }> };
    const changed = () => {
      if (productDocumentHost() !== host && textarea.isConnected) proof.retired.push({ connected: true, disabled: textarea.disabled, value: textarea.value });
    };
    window.addEventListener('wonffice:host-change', changed);
    host.requestOpen = async (...args: Parameters<typeof original>) => {
      const result = await original(...args);
      proof.installed = Boolean(result);
      await held;
      proof.settled = true;
      return result;
    };
    (window as Window & { parentCompletionProof?: typeof proof; releaseParentCompletion?: () => void }).parentCompletionProof = proof;
    (window as Window & { releaseParentCompletion?: () => void }).releaseParentCompletion = () => { window.removeEventListener('wonffice:host-change', changed); release(); };
  }, sharedModule);
  try {
    await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { parentCompletionProof?: { installed: boolean } }).parentCompletionProof?.installed)).toBe(true);
    await expect(state.shell('note').locator('.on-doc > p').first()).toContainText('Target structured body');
    const proof = await page.evaluate(() => (window as Window & { parentCompletionProof?: { settled: boolean; retired: Array<{ connected: boolean; disabled: boolean; value: string }> } }).parentCompletionProof);
    expect(proof?.settled).toBe(false); expect(proof!.retired.length).toBeGreaterThan(0);
    expect(proof!.retired.every(one => one.connected && one.disabled && one.value === 'Initial controlled project draft')).toBe(true);
    // The old input cannot accept a real user gesture while parent completion waits.
    await expect(composer).toBeDisabled();
    await page.keyboard.insertText(" rejected retired feedback");
    await expect(composer).toHaveValue("Initial controlled project draft");
    await expect(page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true })).toBeDisabled();
    expect(state.projectRecord).toEqual(originalProject); expect(state.projectWrites).toHaveLength(0);
    expect(state.originals.get(documentId)!.text).toBe(sourceText); expect(state.originals.get(state.secondNoteId)!.text).toBe(targetText);
    expect(state.writes).toHaveLength(0);
    await page.evaluate(() => (window as Window & { releaseParentCompletion?: () => void }).releaseParentCompletion!());
    await expect.poll(() => page.evaluate(() => (window as Window & { parentCompletionProof?: { settled: boolean } }).parentCompletionProof?.settled)).toBe(true);
    await expect(page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Note 열기', exact: true })).toBeEnabled();
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.secondNoteId}\\?tenant=${id}$`));
    expect(state.projectRecord).toEqual(originalProject); expect(state.projectWrites).toHaveLength(0); expect(state.writes).toHaveLength(0);
  } finally { await page.evaluate(() => (window as Window & { releaseParentCompletion?: () => void }).releaseParentCompletion?.()); }
});


for (const late of ['unchanged', 'input'] as const) test(`same raw Word host replacement checks prepared feedback ${late}`, async ({ page }) => {
  const state = await controlledMixedWorkspace(page, 'editor', { project: true, secondWord: true });
  const sourceURL = page.url(), sourceText = state.originals.get(state.wordId)!.text;
  const targetText = state.originals.get(state.secondWordId)!.text;
  await (await projectFeedbackAction(page, '의견 0')).click();
  const composer = page.getByRole('textbox', { name: '프로젝트 의견 입력', exact: true });
  await expect(composer).toHaveValue('Initial controlled project draft');
  await page.evaluate(async module => {
    const { productDocumentHost } = await import(module), host = productDocumentHost();
    if (host?.product !== 'word') throw new Error('Expected actual Word source host');
    (window as Window & { capturedWordSource?: unknown }).capturedWordSource = { host, id: host.id(), epoch: host.identityEpoch?.() };
  }, sharedModule);
  await observeActualSameProductOpen(page);
  const releaseTarget = state.hold(state.secondWordId);
  try {
    await page.locator('.ow-file-navigation').getByRole('button', { name: 'Second rich Word 열기', exact: true }).click();
    await expect.poll(() => state.reads.filter(one => one === state.secondWordId).length).toBe(1);
    await expect(page).toHaveURL(sourceURL);
    if (late === 'input') {
      await composer.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' latest Word feedback');
      await expect(composer).toHaveValue('Initial controlled project draft latest Word feedback');
      await expect.poll(() => state.projectRecord.drafts[state.feedbackKey]).toBe('Initial controlled project draft latest Word feedback');
    }
    releaseTarget();
    await expect.poll(async () => (await sameProductOpenProof(page))?.settled).toBe(1);
    expect(state.originals.get(state.wordId)!.text).toBe(sourceText); expect(state.originals.get(state.secondWordId)!.text).toBe(targetText);
    expect(state.writes).toHaveLength(0);
    if (late === 'input') {
      await expect(page).toHaveURL(sourceURL); expect((await sameProductOpenProof(page))?.result).toBe(false);
      await expect(composer).toHaveValue('Initial controlled project draft latest Word feedback'); expect(state.projectWrites).toHaveLength(1);
    } else {
      expect((await sameProductOpenProof(page))?.result).toBe(true);
      await expect(page).toHaveURL(new RegExp(`/${workspaceId}/${state.secondWordId}\\?tenant=${id}$`));
      expect(await page.evaluate(async module => {
        const { productDocumentHost } = await import(module), target = productDocumentHost();
        const source = (window as Window & { capturedWordSource?: { host: unknown; id: string; epoch: unknown } }).capturedWordSource!;
        return target === source.host && target!.id() !== source.id && target!.identityEpoch?.() !== source.epoch;
      }, sharedModule)).toBe(true);
      expect(state.projectWrites).toHaveLength(0);
    }
  } finally { releaseTarget(); }
});
