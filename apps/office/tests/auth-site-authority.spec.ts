import { createHash } from 'node:crypto';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { siteFileText } from '../../../packages/office-site/src/site-file';
import { siteNativeFixture as fixture, type SiteNativeNode as NativeNode } from './helpers/site-native-fixture';

// Controlled HTTP authority responses; actual Site App, runtime and nested input.
// This does not qualify real token expiry, OIDC or PostgreSQL.
const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const copyId = '00000000-0000-4000-8000-000000000004';
const issuer = 'http://127.0.0.1:18180/realms/wonffice-local';
const origin = `http://127.0.0.1:${process.env.OFFICE_AUTH_TEST_PORT ?? '5191'}`;
const pendingPrefix = 'wonffice.site.pending.v1:';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const shell = (page: Page) => page.locator('[data-server-site-workspace]');
const body = (page: Page) => page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
type SaveRequest = { snapshotText: string; idempotencyKey: string; expectedRevision?: number; title?: string;
  workspaceId?: string; product?: string; fileFormat?: string; fileVersion?: number };


const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) });
async function setup(page: Page, options: { viewer?: boolean; lostAck?: 'update' | 'create'; wrongProduct?: boolean;
  mode?: 'initializing' | 'collaborative'; deep?: boolean; holdDelivery?: boolean } = {}) {
  const source = fixture(options.deep);
  const documents = new Map([[documentId, { title: 'Server Site', snapshotText: siteFileText(source, ''), revision: 1 }]]);
  let role: 'editor' | 'viewer' = options.viewer ? 'viewer' : 'editor';
  let subject = 'site-synthetic';
  const writes: Array<{ operation: 'create' | 'update'; documentId: string; body: SaveRequest }> = [];
  const receipts = new Map<string, unknown>();
  let lose = options.lostAck;
  const head = (id = documentId) => {
    const document = documents.get(id)!;
    return { tenantId, workspaceId, documentId: id, product: options.wrongProduct ? 'note' : 'site', title: document.title,
      metadataRevision: 1, mode: options.mode ?? 'snapshot', revision: document.revision, pageId: null,
      documentKey: `wonffice-${tenantId}-${id}`, fileFormat: 'barocss-site', fileVersion: 1, snapshotHash: hash(document.snapshotText) };
  };
  if (options.holdDelivery) await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    // Hold existing nested idle delivery. Explicit user Save must await the real flush barrier.
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 150 || delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.route(`${issuer}/.well-known/openid-configuration`, route => route.fulfill({ ...json({ issuer,
    authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(`${issuer}/auth**`, route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace('${origin}/auth/callback?code=synthetic&state=${new URL(route.request().url()).searchParams.get('state')}')</script>` }));
  await page.route(`${issuer}/token`, route => route.fulfill({ ...json({ access_token: 'synthetic-site-token', token_type: 'Bearer', expires_in: 300 }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/v1/me', route => route.fulfill(json({ issuer, subject,
    tenants: [{ tenantId, name: 'Site Company', role }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/access`, route => route.fulfill(json({ tenantId, role })));
  await page.route(`**/api/v1/tenants/${tenantId}/workspaces**`, route => route.fulfill(json({
    workspaces: [{ id: workspaceId, name: 'Site workspace' }], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects?**`, route => route.fulfill(json({ projects: [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/projects/*`, route => route.fulfill({ status: 404, ...json({ status: 'not_found' }) }));
  await page.route(`**/api/v1/tenants/${tenantId}/documents?**`, route => route.fulfill(json({
    documents: new URL(route.request().url()).searchParams.get('product') === 'site' ? [...documents.keys()].map(id => head(id)) : [], nextCursor: null })));
  await page.route(`**/api/v1/tenants/${tenantId}/documents/*`, route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const document = documents.get(id);
    return route.fulfill(document ? json({ document: head(id), ...(options.mode ? {} : { snapshotText: document.snapshotText }) })
      : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/receipts/**`, route => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill(role === 'viewer' ? { status: 403, ...json({ status: 'forbidden' }) }
      : receipts.has(key) ? json(receipts.get(key)) : { status: 404, ...json({ status: 'not_found' }) });
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents/*/snapshot`, async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const request = route.request().postDataJSON() as SaveRequest;
    writes.push({ operation: 'update', documentId: id, body: request });
    if (role === 'viewer') return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (options.mode) return route.fulfill({ status: 409, ...json({ status: 'mode_conflict' }) });
    if (receipts.has(request.idempotencyKey)) return route.fulfill(json(receipts.get(request.idempotencyKey)));
    const document = documents.get(id)!;
    if (request.expectedRevision !== document.revision) return route.fulfill({ status: 409, ...json({ status: 'revision_conflict' }) });
    document.snapshotText = request.snapshotText; document.revision++;
    const receipt = { operation: 'update', idempotencyKey: request.idempotencyKey,
      requestHash: hash(JSON.stringify(['update', id, request.expectedRevision, request.snapshotText])),
      document: head(id), snapshotText: request.snapshotText };
    receipts.set(request.idempotencyKey, receipt);
    if (lose === 'update') { lose = undefined; return route.abort('failed'); }
    return route.fulfill(json(receipt));
  });
  await page.route(`**/api/v1/tenants/${tenantId}/documents`, async route => {
    const request = route.request().postDataJSON() as SaveRequest;
    writes.push({ operation: 'create', documentId: copyId, body: request });
    if (role === 'viewer') return route.fulfill({ status: 403, ...json({ status: 'forbidden' }) });
    if (receipts.has(request.idempotencyKey)) return route.fulfill(json(receipts.get(request.idempotencyKey)));
    documents.set(copyId, { title: request.title!, snapshotText: request.snapshotText, revision: 1 });
    const receipt = { operation: 'create', idempotencyKey: request.idempotencyKey,
      requestHash: hash(JSON.stringify(['create', workspaceId, 'site', request.title, 'barocss-site', 1, null, request.snapshotText])),
      document: head(copyId), snapshotText: request.snapshotText };
    receipts.set(request.idempotencyKey, receipt);
    if (lose === 'create') { lose = undefined; return route.abort('failed'); }
    return route.fulfill({ status: 201, ...json(receipt) });
  });
  await page.goto(options.wrongProduct ? `/?tenant=${tenantId}&workspace=${workspaceId}&document=${documentId}&product=site`
    : `/${workspaceId}/${documentId}?tenant=${tenantId}`);
  await page.getByRole('button', { name: '일반 사용자로 들어가기' }).click();
  return { source, writes, text: (id = documentId) => documents.get(id)!.snapshotText,
    revision: (id = documentId) => documents.get(id)!.revision,
    advance: (next: NativeNode) => { documents.set(documentId, { title: 'Server Site', snapshotText: siteFileText(next, ''), revision: documents.get(documentId)!.revision + 1 }); },
    role: (next: 'editor' | 'viewer') => { role = next; }, subject: (next: string) => { subject = next; } };
}

async function openBody(page: Page, deep = false) {
  // A legitimate drawer close retains the dataset screen. First entry instead
  // mounts Admin asynchronously, so wait for either actual connected surface.
  const row = shell(page).getByRole('button', { name: '1행 펼치기', exact: true });
  const dataTab = shell(page).locator('.st-admin [data-admin-tab="data"]');
  await expect.poll(async () => await row.isVisible() || await dataTab.isVisible()).toBe(true);
  if (!await row.isVisible()) {
    await dataTab.click();
    await shell(page).locator('[data-admin-open="글"]').click();
  }
  await expect(row).toBeVisible();
  await row.click();
  await expect(body(page)).toBeVisible();
  if (!deep) return body(page);
  await body(page).getByRole('button', { name: '행 1 열기', exact: true }).click();
  await page.locator('[data-db-item-body]').last().getByRole('button', { name: '행 1 열기', exact: true }).click();
  const nested = page.locator('[data-db-item-body]').last();
  await expect(nested.locator('.on-doc > p')).toBeVisible();
  return nested;
}
async function typeBody(page: Page, target: Locator, text: string) {
  const paragraph = target.locator('p').last();
  await paragraph.click();
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await page.keyboard.press(apple ? 'Meta+ArrowDown' : 'Control+End');
  // End scrolls on macOS. Verify the genuine keyboard caret belongs to this
  // paragraph and leaves no remaining text before inserting the expected suffix.
  await expect.poll(() => paragraph.evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return { within: false, collapsed: false, atEnd: false };
    const remaining = document.createRange();
    remaining.setStart(selection.anchorNode, selection.anchorOffset);
    remaining.setEnd(element, element.childNodes.length);
    return { within: true, collapsed: selection.isCollapsed, atEnd: remaining.toString() === '' };
  })).toEqual({ within: true, collapsed: true, atEnd: true });
  await page.keyboard.insertText(text);
  await expect(target).toContainText(text);
}
async function closeNativeDrawer(page: Page) {
  const peeks = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  // A later native portal covers earlier Close buttons. Close the owned stack
  // in visible order and verify each layer actually retired before continuing.
  while (await peeks.count()) {
    const count = await peeks.count();
    const topmost = peeks.last();
    await expect(topmost).toBeVisible();
    await topmost.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(peeks).toHaveCount(count - 1);
  }
  const drawer = page.getByRole('dialog', { name: '1행', exact: true });
  if (!await drawer.isVisible()) return;
  await drawer.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(drawer).toBeHidden();
}
async function pending(page: Page) {
  return page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()
    .map(key => JSON.parse(localStorage.getItem(key)!)), pendingPrefix) as Promise<Array<{
      draftId: string; status: string; snapshotText: string; attempt?: SaveRequest;
      scope: { subject: string; documentRef: string }; base: { documentId?: string };
    }>>;
}


async function observePrivateExposure(page: Page, marker: string) {
  await page.evaluate(marker => {
    const state = { armed: false, stopped: false, samples: 0, exposed: 0, baseline: false };
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      for (let owner: Element | null = element; owner; owner = owner.parentElement) {
        const css = getComputedStyle(owner);
        if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
      }
      return true;
    };
    const exposed = () => [...document.querySelectorAll('[data-db-item-body] p')].some(element => {
      if (!element.textContent?.includes(marker) || !visible(element)) return false;
      const curtain = document.getElementById('office-auth-curtain');
      if (!curtain || !visible(curtain)) return true;
      const box = element.getBoundingClientRect(), cover = curtain.getBoundingClientRect();
      const css = getComputedStyle(curtain);
      const alpha = css.backgroundColor.startsWith('rgba(') ? Number(css.backgroundColor.split(',').at(-1)!.replace(')', '')) : 1;
      const opaque = css.backgroundColor !== 'transparent' && alpha === 1 && Number(css.opacity) === 1;
      const left = Math.max(0, box.left), top = Math.max(0, box.top);
      const right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
      if (right <= left || bottom <= top) return false;
      const front = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return !opaque || cover.left > left || cover.top > top || cover.right < right || cover.bottom < bottom ||
        !front || (front !== curtain && !curtain.contains(front));
    });
    state.baseline = exposed();
    const sample = () => { if (state.armed && !state.stopped) { state.samples++; if (exposed()) state.exposed++; } };
    const observer = new MutationObserver(sample);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const frame = () => { sample(); if (!state.stopped) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    const arm = () => queueMicrotask(() => { state.armed = true; sample(); });
    window.addEventListener('focus', arm, { once: true });
    (window as unknown as { authorityExposure: unknown }).authorityExposure = { state, observer };
  }, marker);
}
async function exposureProof(page: Page) {
  return page.evaluate(() => {
    const capture = (window as unknown as { authorityExposure: { state: { stopped: boolean; samples: number; exposed: number; baseline: boolean }; observer: MutationObserver } }).authorityExposure;
    capture.state.stopped = true; capture.observer.disconnect();
    return { samples: capture.state.samples, exposed: capture.state.exposed, baseline: capture.state.baseline };
  });
}

for (const transition of ['account replacement', 'expired session'] as const) {
  test(`controlled Site ${transition} never exposes the previous deepest private input during authority recheck`, async ({ page }) => {
    const state = await setup(page, { deep: true });
    const originalText = state.text(), originalRevision = state.revision();
    const marker = 'PRIVATE-DEEPEST-AUTHORITY-DRAFT';
    await typeBody(page, await openBody(page, true), ` ${marker}`);
    await closeNativeDrawer(page);
    await expect.poll(async () => (await pending(page)).some(record => record.snapshotText.includes(marker))).toBe(true);
    const protectedDrafts = await pending(page);
    expect(protectedDrafts.every(record => record.scope.subject === 'site-synthetic')).toBe(true);
    const reopenedDeepest = await openBody(page, true);
    await expect(reopenedDeepest).toContainText(marker);
    // Establish an actual deepest paragraph caret before the authority boundary.
    // The empty insertion preserves all content while retaining the real gesture.
    await typeBody(page, reopenedDeepest, '');
    const retainedBodies = await page.locator('[data-db-item-body], [data-note-body]').elementHandles();
    const retainedContent = await Promise.all(retainedBodies.map(element => element.evaluate(node => {
      if (!(node instanceof Element)) throw new Error('Expected retained native Element');
      return { text: node.textContent,
        inputs: [...node.querySelectorAll('input, textarea')].map(input => (input as HTMLInputElement).value) };
    })));
    expect(retainedBodies.length).toBeGreaterThan(0);
    await observePrivateExposure(page, marker);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let identityStarted = false;
    let identityRequests = 0;
    await page.route('**/api/v1/me', async route => {
      identityStarted = true;
      identityRequests++;
      await held;
      await route.fulfill(transition === 'expired session'
        ? { status: 401, ...json({ status: 'unauthorized' }) }
        : json({ issuer, subject: 'site-replacement-account', tenants: [{ tenantId, name: 'Site Company', role: 'editor' }], nextCursor: null }));
    });
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => identityStarted).toBe(true);
      await expect(page.locator('#office-auth-curtain')).toBeVisible();
      expect(state.writes).toHaveLength(0);
      await page.keyboard.insertText('DENIED-PENDING-AUTHORITY-INPUT');
      await page.keyboard.press('ControlOrMeta+s');
      expect(await Promise.all(retainedBodies.map(element => element.evaluate(node => {
        if (!(node instanceof Element)) throw new Error('Expected retained native Element');
        return { text: node.textContent,
          inputs: [...node.querySelectorAll('input, textarea')].map(input => (input as HTMLInputElement).value) };
      })))).toEqual(retainedContent);
      expect(await pending(page)).toEqual(protectedDrafts);
      expect(state.text()).toBe(originalText);
      expect(JSON.parse(state.text()).document).toEqual(state.source);
      expect(state.revision()).toBe(originalRevision);
      expect(state.writes).toHaveLength(0);
      release();
      if (transition === 'expired session') {
        const loginHeading = page.getByRole('heading', { name: '로그인이 필요합니다', exact: true });
        const reauthenticate = page.getByRole('button', { name: '다시 로그인', exact: true });
        const recheckDraft = page.getByRole('button', { name: '초안 권한 다시 확인', exact: true });
        await expect(loginHeading).toBeVisible();
        await expect(reauthenticate).toBeVisible();
        await expect(recheckDraft).toBeVisible();
        const pointerProof = await Promise.all([loginHeading, recheckDraft, reauthenticate].map(target => target.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const front = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { connected: node.isConnected, elementPointerEventsNone: getComputedStyle(node).pointerEvents === 'none',
            bodyPointerEventsNone: getComputedStyle(document.body).pointerEvents === 'none',
            htmlPointerEventsNone: getComputedStyle(document.documentElement).pointerEvents === 'none',
            centerHitOwned: !!front && (front === node || node.contains(front)) };
        })));
        console.info('EXPIRED_AUTH_POINTER_BOOLEAN', JSON.stringify(pointerProof));
        // A normal click must work even though the original native modal is retained.
        await loginHeading.click();
        await expect(loginHeading).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(recheckDraft).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(reauthenticate).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(recheckDraft).toBeFocused();
        // The first 401 clears the token. A real recheck must run and fail
        // closed locally; another HTTP request would bypass the cleared session.
        const identityRequestsBeforeRecheck = identityRequests;
        expect(identityRequestsBeforeRecheck).toBe(1);
        await page.evaluate(() => {
          const curtain = document.getElementById('office-auth-curtain');
          if (!curtain) throw new Error('Expected authority curtain');
          const state = { shown: 0, hidden: 0 };
          const observer = new MutationObserver(records => {
            for (const record of records) {
              // Record previous attribute presence so a show/hide pair within
              // one React task remains observable without changing its timing.
              if (record.oldValue === null) state.hidden++;
              else state.shown++;
            }
          });
          observer.observe(curtain, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
          (window as unknown as { authorityRecheck: unknown }).authorityRecheck = { state, observer };
        });
        await recheckDraft.click();
        await expect.poll(() => page.evaluate(() => {
          const capture = (window as unknown as { authorityRecheck: { state: { shown: number; hidden: number } } }).authorityRecheck;
          return capture.state.shown > 0 && capture.state.hidden > 0;
        })).toBe(true);
        await page.evaluate(() => {
          const capture = (window as unknown as { authorityRecheck: { observer: MutationObserver } }).authorityRecheck;
          capture.observer.disconnect();
        });
        expect(identityRequests).toBe(identityRequestsBeforeRecheck);
        await expect(page.locator('#office-auth-curtain')).not.toBeVisible();
        await expect(loginHeading).toBeVisible();
        await expect(reauthenticate).toBeVisible();
        await expect(recheckDraft).toBeVisible();
        await expect(page.locator('[data-db-item-body], [data-note-body]')).toHaveCount(retainedBodies.length);
        expect(await Promise.all(retainedBodies.map(element => element.evaluate(node => node.isConnected)))).toEqual(retainedBodies.map(() => true));
        await page.keyboard.press('Escape');
        // Do not activate login. The later real typing/Save checks must remain denied.
        expect(pointerProof.every(proof => proof.centerHitOwned && !proof.elementPointerEventsNone)).toBe(true);
        await expect(page.locator('[data-db-item-body], [data-note-body]')).toHaveCount(retainedBodies.length);
        for (const [index, element] of retainedBodies.entries()) {
          const retained = await element.evaluate(node => {
            if (!(node instanceof Element)) throw new Error('Expected retained native Element');
            const owners: Element[] = [];
            for (let owner: Element | null = node; owner; owner = owner.parentElement) owners.push(owner);
            const hidden = owners.some(owner => {
              const css = getComputedStyle(owner);
              return owner.hasAttribute('hidden') || css.display === 'none' || css.visibility === 'hidden';
            });
            const inert = owners.some(owner => owner.hasAttribute('inert'));
            const rect = node.getBoundingClientRect();
            const hit = rect.width && rect.height ? document.elementFromPoint(
              Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
              Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))) : null;
            return { connected: node.isConnected, hidden, inert, pointerHit: !!hit && (hit === node || node.contains(hit)),
              content: { text: node.textContent,
                inputs: [...node.querySelectorAll('input, textarea')].map(input => (input as HTMLInputElement).value) } };
          });
          expect(retained).toEqual({ connected: true, hidden: true, inert: true, pointerHit: false,
            content: retainedContent[index] });
        }
        const hiddenMatches = page.getByText(marker, { exact: false });
        expect(await hiddenMatches.count()).toBeGreaterThan(0);
        for (const match of await hiddenMatches.all()) await expect(match).toBeHidden();
      } else {
        await expect(page.locator('[data-db-item-body], [data-note-body]')).toHaveCount(0);
        await expect(page.getByText(marker, { exact: false })).toHaveCount(0);
      }
      await expect(page.getByRole('button', { name: /저장된 Site 초안 복구/ })).toHaveCount(0);
      const proof = await exposureProof(page);
      expect(proof.baseline).toBe(true);
      expect(proof.samples).toBeGreaterThan(0);
      expect(proof.exposed).toBe(0);
      expect(await pending(page)).toEqual(protectedDrafts);
      expect(state.text()).toBe(originalText);
      expect(JSON.parse(state.text()).document).toEqual(state.source);
      expect(state.revision()).toBe(originalRevision);
      expect(state.writes).toHaveLength(0);
      await page.keyboard.insertText('DENIED-LATE-AUTHORITY-INPUT');
      await page.keyboard.press('ControlOrMeta+s');
      expect(await pending(page)).toEqual(protectedDrafts);
      expect(state.text()).toBe(originalText);
      expect(state.writes).toHaveLength(0);
      if (transition === 'expired session') {
        expect(await Promise.all(retainedBodies.map(element => element.evaluate(node => {
          if (!(node instanceof Element)) throw new Error('Expected retained native Element');
          return { text: node.textContent,
            inputs: [...node.querySelectorAll('input, textarea')].map(input => (input as HTMLInputElement).value) };
        })))).toEqual(retainedContent);
      }
    } finally { release(); }
  });
}
