import { expect, test, type Page, type Frame } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { representativeDocument } from '../../note/tests/document-centered.helpers';

const source = (path: string) => `/@fs${fileURLToPath(new URL(`../../../${path}`, import.meta.url))}`;
const workspaceModule = source('packages/office-workspace/src/index.ts');
const sharedModule = source('packages/shared/src/index.ts');
const fixtures = {
  word: source('packages/office-word/src/sample-document.ts'),
  slides: source('packages/office-slides/src/sample-deck.ts'),
  site: source('packages/office-site/src/sample-site.ts'),
};
const products = ['word', 'note', 'slides', 'site'] as const;
type Product = typeof products[number];
const fullTitle = (product: Product) => `${product.toUpperCase()} — Customer adoption review and next-quarter delivery recommendations`;

// Retain the exact active native document. Parent tree/route and child editor are
// different windows; child hit testing and editor witnesses must use its Frame.
async function localNative(page: Page): Promise<Frame> {
  // The child header can mount before the parent promotes its navigation owner.
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  const element = page.locator('.ow-native-slot iframe[data-local-native-frame="active"]');
  await expect(element).toHaveCount(1);
  const frame = (await (await element.elementHandle())!.contentFrame())!;
  expect(frame).not.toBeNull();
  await expect(frame.locator('.office-editor-header')).toHaveCount(1);
  // Initial validation installs the current-owner proxy before lifting inert.
  await expect.poll(() => element.evaluate(node => (node as HTMLIFrameElement).inert)).toBe(false);
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  return frame;
}
async function parentPoint(frame: Frame, point: { x: number; y: number }) {
  const origin = (await (await frame.frameElement()).boundingBox())!;
  return { x: origin.x + point.x, y: origin.y + point.y };
}
async function clickNativePoint(page: Page, frame: Frame, point: { x: number; y: number }) {
  const parent = await parentPoint(frame, point);
  await page.mouse.click(parent.x, parent.y);
}
async function visibleBoxes(frame: Frame, selector: string) {
  return frame.evaluate(selector => {
    const overlay = document.querySelector('.sl-overlay')!.getBoundingClientRect();
    return [...document.querySelectorAll(selector)].map(node => {
      const rect = node.getBoundingClientRect();
      return { sid: node.getAttribute('data-bc-sid')!, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2),
        left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }).filter(box => box.width > 20 && box.left >= overlay.left - 2 && box.left + box.width <= overlay.right + 2 &&
      box.top >= overlay.top - 2 && box.top + box.height <= overlay.bottom + 2);
  }, selector);
}

async function populated(page: Page, product: Product) {
  await page.goto('/');
  return page.evaluate(async ({ workspaceModule, fixtures, product, title, note }) => {
    const { OfficeWorkspace, workspaceIdentity, productCodec, productStore, setDocumentTitle, documentURL } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const sample = product === 'note' ? note : product === 'word' ? (await import(fixtures.word)).createSampleDocument()
      : product === 'slides' ? (await import(fixtures.slides)).createSampleDeck() : (await import(fixtures.site)).createSampleSite();
    const id = product === 'note' ? note.attributes.pageId : crypto.randomUUID();
    setDocumentTitle(product, sample, title, id);
    const codec = await productCodec(product);
    await productStore(product).keep({ name: id, title }, codec.text(sample as never), { expectedRevision: null });
    const project = await workspace.createProject('Customer adoption — delivery review', 'Review the original documents');
    project.record.results.push({ id: crypto.randomUUID(), name: title, document: { product, id }, inputs: [] });
    await workspace.saveProject(project.record, project.revision);
    return { id, url: documentURL({ workspace: workspace.id, product, id, project: project.record.id }) };
  }, { workspaceModule, fixtures, product, title: fullTitle(product), note: representativeDocument() });
}
async function savedNative(page: Page, product: Product, id: string) {
  // Observe the installed current owner; never retry or bypass preparation.
  await expect.poll(() => page.evaluate(async sharedModule => {
    const { captureProductNavigation } = await import(sharedModule) as typeof import('@barocss/shared');
    return captureProductNavigation()?.id;
  }, sharedModule)).toBe(id);
  return page.evaluate(async ({ workspaceModule, sharedModule, product, id }) => {
    const { captureProductNavigation } = await import(sharedModule) as typeof import('@barocss/shared');
    const navigation = captureProductNavigation();
    if (!navigation) throw new Error('The current original navigation owner is not ready');
    if (navigation.id !== id) throw new Error('The current navigation owner is a different original');
    if (!await navigation.prepare()) throw new Error('Native input flush did not complete for the original');
    const { productStore } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const saved = await productStore(product).read(id);
    if (!saved) throw new Error('Original is missing');
    return saved.text;
  }, { workspaceModule, sharedModule, product, id });
}
async function wordPanel(frame: Frame, name: string) {
  await frame.getByRole('menuitem', { name: '문서 패널', exact: true }).click();
  await frame.getByRole('menuitemcheckbox', { name, exact: true }).click();
}
async function nativePanel(frame: Frame, name: string) {
  await frame.locator('.office-editor-header').getByRole('menuitem', { name: '패널', exact: true }).click();
  await frame.getByRole('menuitemcheckbox', { name, exact: true }).click();
}
async function openPanels(frame: Frame, product: Product) {
  if (product === 'word') {
    await wordPanel(frame, '개요');
    await expect(frame.locator('.w-outline [data-outline-sid]').first()).toBeVisible();
    await wordPanel(frame, '댓글');
    await expect(frame.locator('.w-comment-text').first()).toBeVisible();
  } else if (product === 'note') {
    await frame.getByRole('button', { name: '노트 페이지 관리', exact: true }).click();
    await frame.getByRole('button', { name: '명령 검색', exact: true }).click();
    const query = frame.getByRole('combobox', { name: '명령 검색어', exact: true });
    await query.fill('목차');
    await frame.getByRole('option').filter({ hasText: '목차' }).click();
    await expect(query).toHaveCount(0);
    await expect(frame.getByRole('region', { name: '문서 탐색', exact: true })).toBeVisible();
  } else if (product === 'slides') {
    await nativePanel(frame, '레이어 · 개체 순서와 컴포넌트');
    await nativePanel(frame, '속성 · 크기, 위치, 모양');
    await expect(frame.locator('#slides-details')).toBeVisible();
    if ((await frame.locator('.sl-body').boundingBox())!.width < 960) await expect(frame.locator('#slides-objects')).toBeHidden();
    else await expect(frame.locator('#slides-objects')).toBeVisible();
    await frame.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
    await expect(frame.locator('.sl-filmstrip button[data-slide]')).toHaveCount(6);
  } else {
    await nativePanel(frame, '페이지 및 구조');
    await expect(frame.locator('.st-navigation-slot')).toBeVisible();
    await nativePanel(frame, '자세한 속성');
    await expect(frame.locator('.st-detail-slot')).toBeVisible();
    if (await frame.locator('.st-body[data-compact]').count()) await expect(frame.locator('.st-navigation-slot')).toBeHidden();
    else await expect(frame.locator('.st-navigation-slot')).toBeVisible();
  }
}

for (const product of products) for (const width of [1170, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`${product} populated native panels and identity at ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const original = await populated(page, product);
    await page.goto(original.url);
    const frame = await localNative(page);
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(page.locator('.ow-file-navigation')).toBeVisible();
    await expect(frame.locator('[data-document-context]')).toHaveCount(0);
    const title = frame.locator('[data-document-identity]');
    await expect(title).toBeVisible();
    if (product === 'word') {
      await expect(title.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle(product));
      await expect(title.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveAttribute('title', fullTitle(product));
      await expect.poll(() => frame.locator('.w-sheet').count()).toBeGreaterThan(1);
      const slot = (await frame.locator('.w-document-slot').boundingBox())!, nativeViewport = (await frame.locator('.w-shell-document').boundingBox())!, capsule = (await frame.locator('.office-editor-view').boundingBox())!;
      expect(nativeViewport.height).toBe(slot.height);
      expect(capsule.width).toBeLessThanOrEqual(320); expect(capsule.height).toBeLessThanOrEqual(48);
      const header = (await frame.locator('.office-editor-header').boundingBox())!;
      expect(capsule.x).toBeGreaterThanOrEqual(header.x); expect(capsule.x + capsule.width).toBeLessThanOrEqual(header.x + header.width);
      await expect(frame.locator('.w-view-utilities')).toHaveCount(0);
      expect(await frame.locator('.w-document-slot').evaluate(el => { const rect = el.getBoundingClientRect(); return !!document.elementFromPoint(rect.x + 10, rect.y + 10)?.closest('.w-shell-document'); })).toBe(true);
      await test.info().attach('native-view-overlay', { body: JSON.stringify({ slot, nativeViewport, capsule }), contentType: 'application/json' });
    } else await expect(title).toContainText(fullTitle(product));
    const before = await savedNative(page, product, original.id);
    await page.screenshot({ path: test.info().outputPath(`${product}-${theme}-${width}-default.png`), animations: 'disabled' });
    await openPanels(frame, product);
    await page.mouse.move(10, 10);
    if (product === 'word' || product === 'site') {
      await expect(frame.locator('.office-workspace-panel-controls')).toHaveCount(0);
      expect(await frame.locator(product === 'word' ? '.w-shell-body' : '.st-body').evaluate(el => getComputedStyle(el).paddingTop)).toBe('0px');
      const geometry = await frame.evaluate(product => {
        const body = document.querySelector(product === 'word' ? '.w-shell-body' : '.st-body')!;
        const header = document.querySelector('.office-editor-header')!;
        const capsules = [...document.querySelectorAll('.office-editor-view')];
        const panels = [...body.querySelectorAll('[data-workspace-panel]')].filter(el => !el.hasAttribute('hidden'));
        const controls = [...capsules.flatMap(el => [...el.querySelectorAll('button')]), ...panels.flatMap(el => [...el.querySelectorAll('header button,.office-panel-header button,input[aria-label="속성 찾기"]')])]
          .filter(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && !el.closest('[hidden]'); });
        return { gap: body.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
          targets: controls.map(el => { const rect = el.getBoundingClientRect(); return {
            name: el.getAttribute('aria-label') || el.textContent, width: rect.width, height: rect.height,
            hit: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
          }; }) };
      }, product);
      await test.info().attach('panel-and-capsule-hit-ownership', { body: JSON.stringify(geometry), contentType: 'application/json' });
      expect(geometry.gap).toBeLessThanOrEqual(1); // Site retains its native 1px chrome border, not a panel row.
      expect(geometry.targets.length).toBeGreaterThan(3);
      for (const target of geometry.targets) expect(target.hit, target.name || 'panel or capsule control').toBe(true);
      // Capsule buttons remain full targets even when a native panel is open.
      const capsuleTargets = await frame.locator('.office-editor-view button').evaluateAll(els =>
        els.filter(el => el.getBoundingClientRect().width > 0).map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
      expect(capsuleTargets.length).toBeGreaterThan(1);
      for (const target of capsuleTargets) { expect(target.width).toBeGreaterThanOrEqual(32); expect(target.height).toBeGreaterThanOrEqual(32); }
      const utility = frame.locator('.office-editor-view');
      const inspector = frame.locator(`[data-workspace-panel="inspector"]`);
      await utility.locator('[data-zoom-in]').click(); await expect(inspector).toBeVisible();
      await utility.locator('[data-zoom-out]').click(); await expect(inspector).toBeVisible();
    }
    const geometry = await frame.evaluate(() => {
      const header = document.querySelector('.office-editor-header')!, name = header.querySelector('[data-document-identity]')!;
      const all = [...header.querySelectorAll('button,input,select,[role="menuitem"]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      const clippedFiles = all.filter(el => el.matches('input[type="file"].sr-only'));
      const controls = all.filter(el => !clippedFiles.includes(el));
      return { title: name.getBoundingClientRect().width, header: header.getBoundingClientRect().height,
        clippedFiles: clippedFiles.map(el => ({ tag: el.tagName, type: el.getAttribute('type'), className: el.className, clipPath: getComputedStyle(el).clipPath, clip: getComputedStyle(el).clip, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, name: el.getAttribute('aria-label') })),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        targets: controls.map(el => ({ hit: el.contains(document.elementFromPoint(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2, el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)), height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, name: el.getAttribute("aria-label") || el.textContent, blocker: document.elementFromPoint(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2, el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)?.outerHTML.slice(0, 250) })) };
    });
    await test.info().attach('header-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    for (const input of geometry.clippedFiles) {
      expect(input.type).toBe('file'); expect(input.width).toBe(1); expect(input.height).toBe(32);
      expect(input.clipPath).toBe('inset(50%)');
    }
    const frameBounds = (await (await frame.frameElement()).boundingBox())!;
    expect(geometry.title).toBeGreaterThan(0); expect(geometry.header).toBe(48);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.targets.length).toBeGreaterThan(3); for (const target of geometry.targets) { expect(target.hit, `${target.name}: ${target.blocker}`).toBe(true); expect(target.height, target.name || "header control").toBeGreaterThanOrEqual(32); expect(target.width, target.name || "header control").toBeGreaterThanOrEqual(32); expect(target.left + frameBounds.x).toBeGreaterThanOrEqual(276); expect(target.right + frameBounds.x, target.name || "header control").toBeLessThanOrEqual(width); }
    await page.screenshot({ path: test.info().outputPath(`${product}-${theme}-${width}-panels.png`), animations: 'disabled' });
    expect(await savedNative(page, product, original.id)).toBe(before);
    expect(page.url()).toBe(new URL(original.url, page.url()).href);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ow-file-navigation')).toBeVisible();
  });
}

for (const storedForm of ['NFC', 'NFD'] as const) {
  test(`Korean tree search matches ${storedForm} originals without remounting the editor`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const original = await populated(page, 'word');
    const koreanTitle = '분기 보고서'.normalize(storedForm);
    const key = await page.evaluate(async ({ workspaceModule, koreanTitle }) => {
      const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
      const workspace = new OfficeWorkspace(workspaceIdentity());
      const id = await workspace.create('note', koreanTitle);
      const project = await workspace.createProject('Korean search', 'Original reference');
      project.record.results.push({ id: crypto.randomUUID(), name: koreanTitle, document: { product: 'note', id }, inputs: [] });
      await workspace.saveProject(project.record, project.revision);
      return `note:${id}`;
    }, { workspaceModule, koreanTitle });
    await page.goto(original.url);
    const frame = await localNative(page);
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
    const before = await savedNative(page, 'word', original.id), url = page.url();
    const paragraph = frame.locator('.w-paragraph').last(), node = await paragraph.elementHandle();
    const tree = page.locator('.ow-file-navigation');
    for (const perspective of ['프로젝트', '내 파일']) {
      await tree.getByRole('button', { name: perspective, exact: true }).click();
      const search = tree.getByRole('textbox', { name: '파일 검색', exact: true });
      const query = '분기 보고서'.normalize(storedForm === 'NFC' ? 'NFD' : 'NFC');
      await search.fill(''); await search.pressSequentially(query);
      await expect(tree.locator('[data-original]')).toHaveCount(1);
      await expect(tree.locator(`[data-original="${key}"]`)).toHaveAttribute('title', koreanTitle);
      await search.fill('없음'); await expect(tree.locator('[data-original]')).toHaveCount(0);
      await search.fill(`  ${query}  `); await expect(tree.locator('[data-original]')).toHaveCount(1);
    }
    expect(await node!.evaluate(el => el.isConnected)).toBe(true);
    expect(page.url()).toBe(url);
    expect(await savedNative(page, 'word', original.id)).toBe(before);
  });
}

test('Slides narrow floating panels preserve stage, selection, history and numeric draft', async ({ page }) => {
  await page.setViewportSize({ width: 1170, height: 1000 });
  const original = await populated(page, 'slides'); await page.goto(original.url);
  const frame = await localNative(page);
  // Absence alone can pass before the Workspace frame mounts its native-entry cover.
  await expect(page.locator('.ow-file-navigation')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(frame.locator('[data-document-context]')).toHaveCount(0);
  await expect.poll(async () => (await visibleBoxes(frame, '.sl-text-frame')).length).toBeGreaterThan(0);
  const [candidate] = await visibleBoxes(frame, '.sl-text-frame');
  // Initial fit/fonts can move the frame after the first visible box appears.
  // Measure the actual stable frame before clicking; do not bypass its overlay or set selection.
  const point = await frame.evaluate(async sid => {
    await document.fonts.ready;
    let previous = '', stable = 0, point = { x: 0, y: 0 };
    while (stable < 3) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const frame = document.querySelector<HTMLElement>(`.sl-stage .sl-text-frame[data-bc-sid="${CSS.escape(sid)}"]`)!;
      const box = frame.getBoundingClientRect();
      point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const signature = JSON.stringify({ ...point, width: box.width, height: box.height });
      stable = signature === previous && box.width > 20 && box.height > 10 ? stable + 1 : 0;
      previous = signature;
    }
    return point;
  }, candidate.sid);
  await clickNativePoint(page, frame, point);
  await expect.poll(() => frame.evaluate(() => (window as { editor?: { selection?: { nodeIds?: string[] } } }).editor?.selection?.nodeIds)).toEqual([candidate.sid]);
  const [title] = await visibleBoxes(frame, '.sl-text-frame');
  const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const geometry = () => frame.locator('.sl-stage,.sl-overlay').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, transform: getComputedStyle(el).transform }; }));
  const before = await native(), stage = await geometry();
  const header = frame.locator('.sl-topbar'), navigation = header.getByRole('menuitem', { name: '패널', exact: true });
  const toggleNavigation = () => nativePanel(frame, '레이어 · 개체 순서와 컴포넌트'), toggleInspector = () => nativePanel(frame, '속성 · 크기, 위치, 모양');
  await toggleNavigation(); await expect(frame.locator('#slides-objects')).toBeVisible();
  await toggleInspector(); await expect(frame.locator('#slides-objects')).toBeHidden();
  const width = frame.locator('#slides-details').getByRole('spinbutton', { name: '너비', exact: true });
  const initial = await width.inputValue(); await width.fill('99');
  await toggleInspector(); await expect(frame.locator('#slides-details')).toBeHidden(); await expect(frame.locator('#slides-objects')).toBeVisible();
  await expect(navigation).toBeFocused();
  const hit = await frame.evaluate(({ x, y }) => { const element = document.elementFromPoint(x, y); return { html: element?.outerHTML, nativeCanvas: !!element?.closest('.sl-overlay') }; }, title);
  await test.info().attach('selected-content-point', { body: JSON.stringify(hit), contentType: 'application/json' });
  expect(hit.nativeCanvas).toBe(true);
  await clickNativePoint(page, frame, title);
  expect(await native()).toEqual(before);
  await toggleInspector(); await expect(width).toHaveValue('99'); await width.press('Escape'); await expect(width).toHaveValue(initial);
  expect(await native()).toEqual(before); expect(await geometry()).toEqual(stage);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(frame.locator('#slides-objects')).toBeVisible(); await expect(frame.locator('#slides-details')).toBeVisible();
  expect(await native()).toEqual(before); await expect(width).toHaveValue(initial);
  await frame.locator('#slides-objects button').first().focus();
  await page.setViewportSize({ width: 1170, height: 1000 });
  await expect(navigation).toBeFocused();
  await expect(frame.locator('#slides-objects')).toBeHidden(); await expect(frame.locator('#slides-details')).toBeVisible();
  expect(await native()).toEqual(before); await expect(width).toHaveValue(initial);
});

test('Word desktop panels retain the native selection and unsubmitted comment through resize', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'word'); await page.goto(original.url);
  const frame = await localNative(page);
  await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Workspace review');
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => frame.evaluate(() => (window as any).editor.selection?.collapsed)).toBe(false);
  const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native();
  await wordPanel(frame, '댓글');
  const draft = frame.getByRole('textbox', { name: 'New comment', exact: true });
  await draft.fill('Review this original, not a copy.');
  await page.setViewportSize({ width: 1170, height: 1000 }); await expect(draft).toBeHidden();
  const inspector = frame.getByRole('menuitem', { name: '문서 패널', exact: true });
  await wordPanel(frame, '댓글'); await expect(draft).toHaveValue('Review this original, not a copy.');
  expect(await native()).toEqual(before);
  await expect(frame.locator('.w-shell-body')).toHaveAttribute('data-compact', 'true');
  await draft.click(); await expect(frame.getByRole('tooltip')).toHaveCount(0);
  const close = frame.getByRole('button', { name: '댓글 닫기', exact: true });
  await page.mouse.move(20, 500); await close.focus();
  await expect(frame.getByRole('tooltip', { name: '댓글 닫기', exact: true })).toBeVisible();
  await close.press('Escape'); await expect(frame.getByRole('tooltip')).toHaveCount(0);
  await expect(draft).toBeVisible(); await expect(draft).toHaveValue('Review this original, not a copy.');
  expect(await native()).toEqual(before);
  await close.press('Escape'); await expect(draft).toBeHidden(); await expect(inspector).toBeFocused();
  await wordPanel(frame, '댓글'); await expect(draft).toHaveValue('Review this original, not a copy.');
  await draft.click(); await expect(frame.getByRole('tooltip')).toHaveCount(0);
  await draft.press('Escape'); await expect(draft).toBeHidden(); await expect(inspector).toBeFocused();
  await inspector.press('Enter'); await frame.getByRole('menuitemcheckbox', { name: '댓글', exact: true }).click(); await expect(draft).toHaveValue('Review this original, not a copy.');
  await page.setViewportSize({ width: 1440, height: 1000 }); await expect(draft).toBeVisible();
  expect(await native()).toEqual(before); await expect(page.locator('.ow-file-navigation')).toBeVisible();
});

test('Word panel menu owns checked routes and keyboard return without changing the original', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'word'); await page.goto(original.url);
  const frame = await localNative(page);
  await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
  await expect.poll(() => frame.locator('.w-sheet').count()).toBeGreaterThan(1);
  const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native(), opener = frame.getByRole('menuitem', { name: '문서 패널', exact: true });
  await opener.focus(); await opener.press('Enter');
  const outline = frame.getByRole('menuitemcheckbox', { name: '개요', exact: true });
  const business = frame.getByRole('menuitemcheckbox', { name: '요구·결정', exact: true });
  await expect(outline).toHaveAttribute('aria-checked', 'false'); await expect(outline).toBeFocused();
  await outline.press('End'); await expect(frame.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true })).toBeFocused();
  await business.press('Home'); await expect(outline).toBeFocused();
  await outline.press('Enter'); await expect(frame.locator('.w-outline [data-outline-sid]').first()).toBeVisible();
  await opener.click(); await expect(outline).toHaveAttribute('aria-checked', 'true');
  await business.click(); await expect(frame.locator('.w-business-pair')).toBeVisible();
  await opener.click(); await expect(business).toHaveAttribute('aria-checked', 'true');
  await business.click(); await expect(frame.locator('.w-business-pair')).toHaveCount(0);
  await wordPanel(frame, '댓글'); await expect(frame.locator('.w-comment-text').first()).toBeVisible();
  await frame.getByRole('button', { name: '댓글 닫기', exact: true }).click(); await expect(opener).toBeFocused();
  await opener.press('Enter'); await expect(frame.getByRole('menuitemcheckbox', { name: '댓글', exact: true })).toHaveAttribute('aria-checked', 'false');
  await outline.press('Escape'); await expect(frame.getByRole('menu', { name: '문서 패널', exact: true })).toHaveCount(0);
  await expect(opener).toBeFocused(); expect(await native()).toEqual(before);
  await opener.focus(); await opener.press('Enter');
  const full = frame.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true });
  await full.press('Enter'); await expect(frame.getByRole('group', { name: '전체 Word 도구', exact: true })).toBeVisible();
  await expect(frame.getByRole('toolbar', { name: '문서 편집 도구', exact: true })).toBeVisible();
  expect(await native()).toEqual(before);
});

for (const { width, theme } of [{ width: 1170, theme: 'light' }, { width: 1170, theme: 'dark' }, { width: 1440, theme: 'light' }] as const) {
  test(`Word width fit exposes the original beside comments at ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const original = await populated(page, 'word'); await page.goto(original.url);
    const frame = await localNative(page);
    await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
    await expect.poll(() => frame.locator('.w-sheet').count()).toBeGreaterThan(1);
    const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
    const paragraph = frame.locator('.w-paragraph').first();
    await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.press('Shift+Home');
    await expect.poll(async () => (await native()).selection?.collapsed).toBe(false);
    const before = await native(), initialZoom = await frame.locator('.w-zoom-frame').getAttribute('data-zoom');
    const paperWidth = await frame.locator('.w-sheet').first().evaluate(el => (el as HTMLElement).offsetWidth);
    await wordPanel(frame, '댓글');
    await expect(frame.getByRole('textbox', { name: 'New comment', exact: true })).toBeVisible();
    await expect(frame.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', initialZoom!);
    await frame.getByRole('button', { name: '너비에 맞춤', exact: true }).click();
    const bounds = () => frame.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('.w-shell-document')!, sheet = document.querySelector<HTMLElement>('.w-sheet')!, panel = document.querySelector<HTMLElement>('[data-workspace-panel="inspector"]')!;
      const p = pane.getBoundingClientRect(), s = sheet.getBoundingClientRect(), c = panel.getBoundingClientRect();
      return { left: p.left, right: Math.min(p.left + pane.clientWidth, c.left), pageLeft: s.left, pageRight: s.right, pageWidth: sheet.offsetWidth };
    });
    await expect.poll(async () => { const b = await bounds(); return b.pageRight - b.right; }).toBeLessThanOrEqual(1);
    const fitted = await bounds(); expect(fitted.pageLeft).toBeGreaterThanOrEqual(fitted.left);
    expect(await native()).toEqual(before);
    const nested = frame.locator('.w-surface td').filter({ hasText: /^C2$/ });
    await expect(nested).toHaveCount(1);
    expect(await nested.evaluate(el => !!el.closest('table') && !!el.closest('.w-surface'))).toBe(true);
    for (const target of [nested, frame.locator('.w-paragraph').last()]) {
      await target.scrollIntoViewIfNeeded();
      expect(await target.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.right - 2, r.top + r.height / 2)); })).toBe(true);
    }
    expect(await native()).toEqual(before); expect((await bounds()).pageWidth).toBe(paperWidth);
    await test.info().attach('width-fit-visible-area', { body: JSON.stringify(fitted), contentType: 'application/json' });
    await page.screenshot({ path: test.info().outputPath(`word-fit-${width}-${theme}.png`), animations: 'disabled' });
  });
}

test('Word dark two-column native ink stays readable before and after width fit', async ({ page }) => {
  await page.setViewportSize({ width: 1170, height: 1000 }); await page.emulateMedia({ colorScheme: 'dark' });
  const original = await populated(page, 'word'); await page.goto(original.url);
  const frame = await localNative(page);
  await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
  await expect.poll(() => frame.locator('.w-sheet').count()).toBeGreaterThan(1);
  const body = frame.locator('.w-paragraph').filter({ hasText: /^8\. Text in a section/ });
  await expect(body).toHaveCount(1); await body.scrollIntoViewIfNeeded();
  const paint = () => body.evaluate(el => {
    const style = getComputedStyle(el), sheet = document.querySelector<HTMLElement>('.w-sheet:last-child');
    const heading = [...document.querySelectorAll<HTMLElement>('.w-surface h1,.w-surface h2')].find(node => node.textContent === 'Two columns');
    let opacity = 1; for (let parent: Element | null = el; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
    return { text: el.textContent, foreground: style.color, background: sheet ? getComputedStyle(sheet).backgroundColor : null, opacity,
      headingForeground: heading ? getComputedStyle(heading).color : null,
      resources: [...document.querySelectorAll<HTMLElement>('.w-endnotes,.w-bibliography')].map(node => ({ name: node.className, foreground: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor })) };
  });
  const before = await paint();
  expect(before.foreground).toBe('rgb(26, 26, 26)'); expect(before.background).toBe('rgb(255, 255, 255)'); expect(before.opacity).toBe(1);
  expect(before.headingForeground).toBe('rgb(26, 54, 93)');
  expect(before.resources).toHaveLength(2);
  for (const resource of before.resources) expect(resource.background, resource.name).toBe('rgb(255, 255, 255)');
  await wordPanel(frame, '댓글'); await frame.getByRole('button', { name: '너비에 맞춤', exact: true }).click();
  await body.scrollIntoViewIfNeeded(); await expect(body).toBeVisible();
  expect(await paint()).toEqual(before);
  await test.info().attach('dark-native-paint-before-after', { body: JSON.stringify(before), contentType: 'application/json' });
  console.log('dark-native-paint', JSON.stringify(before));
});

test('Note nested input and native block properties survive Workspace navigation and reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'note'); await page.goto(original.url);
  let frame = await localNative(page);
  const block = frame.locator('.on-doc .w-callout').first();
  await expect(block).toBeVisible();
  const paragraph = block.locator('p').first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Last nested input');
  await expect(paragraph).toContainText('Last nested input');
  const before = await savedNative(page, 'note', original.id);
  await paragraph.click();
  const sid = await block.getAttribute('data-bc-sid'), grip = frame.locator('[data-note-grip]');
  await expect(grip).toHaveAttribute('data-note-grip', sid!); await grip.click();
  await frame.getByRole('menuitem', { name: '블록 설정', exact: true }).click();
  const properties = frame.locator('[data-note-properties]'), field = properties.locator('[data-note-field="type"]');
  await expect(properties).toBeVisible(); await expect(field).toHaveValue('note');
  expect(await field.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await properties.getByRole('button', { name: '속성 닫기', exact: true }).click(); await expect(properties).toHaveCount(0);
  await page.locator('.ow-file-navigation').getByRole('button', { name: '내 파일', exact: true }).click();
  frame = await localNative(page);
  expect(await savedNative(page, 'note', original.id)).toBe(before);
  await page.reload(); frame = await localNative(page); await expect(frame.locator('.on-doc .w-callout').first().locator('p').first()).toContainText('Last nested input');
  expect(await savedNative(page, 'note', original.id)).toBe(before);
});

test('Word common header history and title preserve the original across reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'word'); await page.goto(original.url);
  let frame = await localNative(page);
  const header = frame.locator('.office-editor-header');
  const title = header.getByRole('textbox', { name: '문서 제목', exact: true });
  await expect(title).toHaveValue(fullTitle('word'));
  const native = () => frame.evaluate(() => (window as { editor?: { exportDocument(): unknown } }).editor!.exportDocument());
  const before = await native();
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Header history proof');
  await expect(paragraph).toContainText('Header history proof'); const typed = await native();
  await header.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(native).toEqual(before);
  await header.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect.poll(native).toEqual(typed);
  await title.fill('Original renamed through its native header'); await title.press('Enter');
  await expect(title).toHaveValue('Original renamed through its native header');
  const saved = await savedNative(page, 'word', original.id);
  await page.reload(); frame = await localNative(page); await expect(frame.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue('Original renamed through its native header');
  await expect(frame.locator('.w-paragraph').last()).toContainText('Header history proof');
  expect(await savedNative(page, 'word', original.id)).toBe(saved);
  expect(page.url()).toBe(new URL(original.url, page.url()).href);
});

test('Slides common header insertion and history operate on the mounted original', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'slides'); await page.goto(original.url);
  let frame = await localNative(page);
  await expect(frame.locator('[data-document-identity]')).toContainText(fullTitle('slides'));
  const root = await frame.locator('#root').elementHandle();
  const header = frame.locator('.office-editor-header');
  const native = () => frame.evaluate(() => (window as { editor?: { exportDocument(): unknown } }).editor!.exportDocument());
  const before = await native();
  await header.getByRole('button', { name: '삽입', exact: true }).click();
  await frame.getByRole('menuitem', { name: '사각형', exact: true }).click();
  await expect.poll(native).not.toEqual(before); const inserted = await native();
  await header.locator('[data-control="undo"]').click(); await expect.poll(native).toEqual(before);
  await header.locator('[data-control="redo"]').click(); await expect.poll(native).toEqual(inserted);
  expect(await root!.evaluate(node => node.isConnected)).toBe(true);
  const saved = await savedNative(page, 'slides', original.id); await page.reload(); frame = await localNative(page);
  await expect(frame.locator('[data-document-identity]')).toContainText(fullTitle('slides'));
  expect(await savedNative(page, 'slides', original.id)).toBe(saved);
});

test('Site canvas capsules retain native history and keep advanced tools keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'site'); await page.goto(original.url);
  const frame = await localNative(page);
  const insertion = frame.getByRole('toolbar', { name: '사이트 삽입 도구', exact: true }), view = frame.getByRole('toolbar', { name: '사이트 보기', exact: true });
  await expect(insertion).toBeVisible(); await expect(view).toBeVisible();
  const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native();
  for (const label of ['실행 취소', '다시 실행', '삽입']) await expect(insertion.getByRole('button', { name: label, exact: true })).toBeVisible();
  for (const label of ['확대', '축소']) await expect(view.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(view.locator('.st-preview-toggle')).toBeVisible();
  for (const capsule of [insertion, view]) {
    const box = (await capsule.boundingBox())!; expect(box.width).toBeLessThanOrEqual(480); expect(box.height).toBeLessThanOrEqual(48);
    const hits = await capsule.locator('button,input').evaluateAll(nodes => nodes.filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, hit: el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }; }));
    await test.info().attach('capsule-hit-targets', { body: JSON.stringify({ box, hits }), contentType: 'application/json' });
    expect(hits.length).toBe(capsule === insertion ? 3 : 5);
    for (const hit of hits) { expect(hit.width).toBeGreaterThanOrEqual(32); expect(hit.height).toBeGreaterThanOrEqual(32); expect(hit.hit).toBe(true); }
  }
  const more = frame.getByRole('menuitem', { name: '패널', exact: true });
  await more.focus(); await more.press('Enter');
  await frame.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true }).click();
  const full = frame.locator('.st-all-tools-popup'); await expect(full).toBeVisible();
  expect(await native()).toEqual(before);
  const tooltip = frame.getByRole('tooltip'), owned = await tooltip.isVisible();
  await page.keyboard.press('Escape');
  if (owned) { await expect(tooltip).toHaveCount(0); await page.keyboard.press('Escape'); }
  await expect(full).toBeHidden(); await expect(more).toBeFocused();
  expect(await native()).toEqual(before);
  const preview = view.locator('.st-preview-toggle'); await preview.click();
  await expect(preview).toHaveAttribute('aria-pressed', 'true'); expect((await native()).document).toEqual(before.document);
  await preview.click(); await expect(preview).toHaveAttribute('aria-pressed', 'false');
  expect((await native()).document).toEqual(before.document);
  await insertion.getByRole('button', { name: '삽입', exact: true }).click();
  await frame.getByRole('button', { name: '제목', exact: true }).click();
  await expect.poll(async () => (await native()).document).not.toEqual(before.document);
  const inserted = (await native()).document;
  await insertion.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await native()).document).toEqual(before.document);
  await insertion.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect.poll(async () => (await native()).document).toEqual(inserted);
  await frame.getByRole('button', { name: '명령 검색', exact: true }).click();
  const search = frame.getByRole('combobox', { name: '명령 검색어', exact: true });
  await search.fill('실행 취소'); await search.press('Enter');
  await expect(search).toHaveCount(0);
  await expect.poll(async () => (await native()).document).toEqual(before.document);
});

test('Site compact panel close exposes the right-edge original without committing its property draft', async ({ page }) => {
  await page.setViewportSize({ width: 1170, height: 1000 });
  const original = await populated(page, 'site'); await page.goto(original.url);
  const frame = await localNative(page);
  const picture = frame.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]');
  await expect(picture).toBeVisible();
  await frame.locator('.office-editor-view [data-zoom-fit]').click();
  const pictureSid = await picture.evaluate(el => el.closest('[data-bc-sid]')?.getAttribute('data-bc-sid')?.split('~').pop());
  expect(pictureSid).toBeTruthy();
  const selectedPicture = () => frame.evaluate(() => (window as any).editor.selection?.nodeIds);
  const rect = (await picture.boundingBox())!;
  const point = { x: rect.x + rect.width - 10, y: rect.y + 10 };
  const hit = () => picture.evaluate(el => { const rect = el.getBoundingClientRect(); return el.closest('[data-frame="desktop"]')?.contains(document.elementFromPoint(rect.right - 10, rect.y + 10)) ?? false; });
  expect(await hit()).toBe(true);
  await page.keyboard.down('Meta'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Meta');
  await expect.poll(selectedPicture).toEqual([pictureSid]);
  const detail = frame.getByRole('menuitem', { name: '패널', exact: true }); await nativePanel(frame, '자세한 속성');
  const panel = frame.locator('.office-properties'); await panel.getByRole('tab', { name: '모양', exact: true }).click();
  const input = panel.getByRole('spinbutton', { name: '기울기', exact: true });
  const native = () => frame.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native(); await input.fill('12'); expect(await native()).toEqual(before);
  // Explicit close exposes the original; toggling never silently changes zoom, history or the draft.
  await nativePanel(frame, '자세한 속성'); await expect(frame.locator('.st-detail-slot')).toBeHidden();
  expect(await native()).toEqual(before); expect(await hit()).toBe(true); await expect(detail).toBeFocused();
  await page.keyboard.down('Meta'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Meta');
  await expect.poll(selectedPicture).toEqual([pictureSid]);
  expect((await native()).document).toEqual(before.document);
  await nativePanel(frame, '자세한 속성'); await expect(input).toHaveValue('12'); expect(await native()).toEqual(before);
  await input.press('Escape'); expect(await native()).toEqual(before);
});

for (const product of ['slides', 'site'] as const) test(`${product} document menu owns recent-library keyboard access and restores its connected opener`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, product); await page.goto(original.url);
  const frame = await localNative(page);
  await expect(frame.locator('[data-document-identity]')).toContainText(fullTitle(product));
  await expect.poll(() => page.evaluate(async ({ sharedModule, id }) => {
    const { captureProductNavigation } = await import(sharedModule) as typeof import('@barocss/shared');
    const owner = captureProductNavigation(); return owner?.id === id && owner.isCurrent();
  }, { sharedModule, id: original.id })).toBe(true);
  const before = await savedNative(page, product, original.id);
  const header = frame.locator('.office-document-bar');
  await expect(header.getByRole('button', { name: '최근 자료', exact: true })).toHaveCount(0);
  await expect(header.locator('input[type="file"]')).toHaveCount(0);
  const opener = header.getByRole('menuitem', { name: '문서 메뉴', exact: true });
  await opener.focus(); await opener.press('Enter');
  const menu = frame.getByRole('menu', { name: '문서 메뉴', exact: true });
  const commands = menu.locator('[role^="menuitem"]:not([aria-disabled="true"])');
  await expect(commands.first()).toBeFocused();
  await page.keyboard.press('End'); await expect(commands.last()).toBeFocused();
  await page.keyboard.press('Home'); await expect(commands.first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(opener).toBeFocused();
  await opener.press('Enter');
  await frame.getByRole('menuitem', { name: '최근 자료', exact: true }).click();
  const library = frame.getByRole('dialog', { name: product === 'slides' ? '최근 발표 자료' : '최근 사이트', exact: true });
  await expect(library).toBeVisible();
  await expect(library.getByRole('button', { name: '보관함 전체 백업', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(library).toHaveCount(0); await expect(opener).toBeFocused();
  expect(await savedNative(page, product, original.id)).toBe(before);
  expect(page.url()).toBe(new URL(original.url, page.url()).href);
});
