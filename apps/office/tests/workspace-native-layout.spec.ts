import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { visibleBoxes } from '../../slide/tests/helpers';
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
  return page.evaluate(async ({ workspaceModule, sharedModule, product, id }) => {
    const { captureProductNavigation } = await import(sharedModule) as typeof import('@barocss/shared');
    const navigation = captureProductNavigation();
    if (!navigation || navigation.id !== id || !await navigation.prepare()) throw new Error('Native input flush did not complete for the original');
    const { productStore } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const saved = await productStore(product).read(id);
    if (!saved) throw new Error('Original is missing');
    return saved.text;
  }, { workspaceModule, sharedModule, product, id });
}
async function openPanels(page: Page, product: Product) {
  if (product === 'word') {
    const narrow = page.locator('.w-shell-body[data-compact]');
    if (await narrow.count()) {
      await page.locator('[data-workspace-toggle="navigation"]').click();
      await expect(page.locator('.w-outline [data-outline-sid]').first()).toBeVisible();
      await page.locator('[data-workspace-toggle="inspector"]').click();
    } else {
      await page.locator('.w-outline-closed').click(); await page.locator('.w-comments-closed').click();
    }
    await expect(page.locator('.w-comment-text').first()).toBeVisible();
  } else if (product === 'note') {
    await page.getByRole('button', { name: '노트 페이지 관리', exact: true }).click();
    await page.locator('.office-document-menu [data-menu]').click();
    await page.getByRole('menuitem', { name: '목차', exact: true }).click();
    await expect(page.getByRole('region', { name: '문서 탐색', exact: true })).toBeVisible();
  } else if (product === 'slides') {
    await page.getByRole('button', { name: '레이어', exact: true }).click();
    await page.getByRole('button', { name: '속성', exact: true }).click();
    await expect(page.locator('#slides-details')).toBeVisible();
    if ((await page.locator('.sl-body').boundingBox())!.width < 960) await expect(page.locator('#slides-objects')).toBeHidden();
    else await expect(page.locator('#slides-objects')).toBeVisible();
    await page.getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
    await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(6);
  } else {
    await page.getByRole('button', { name: '페이지 및 구조', exact: true }).click();
    await expect(page.locator('.st-navigation-slot')).toBeVisible();
    await page.getByRole('button', { name: '자세한 속성', exact: true }).click();
    await expect(page.locator('.st-detail-slot')).toBeVisible();
    if (await page.locator('.st-body[data-compact]').count()) await expect(page.locator('.st-navigation-slot')).toBeHidden();
    else await expect(page.locator('.st-navigation-slot')).toBeVisible();
  }
}

for (const product of products) for (const width of [1170, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`${product} populated native panels and identity at ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const original = await populated(page, product);
    await page.goto(original.url);
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(page.locator('.ow-file-navigation')).toBeVisible();
    await expect(page.locator('[data-document-context]')).toContainText('Customer adoption — delivery review');
    const title = page.locator('[data-document-identity]');
    await expect(title).toBeVisible();
    if (product === 'word') {
      await expect(title.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle(product));
      await expect(title.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveAttribute('title', fullTitle(product));
      await expect.poll(() => page.locator('.w-sheet').count()).toBeGreaterThan(1);
    } else await expect(title).toContainText(fullTitle(product));
    const before = await savedNative(page, product, original.id);
    await openPanels(page, product);
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.office-editor-header')!, name = header.querySelector('[data-document-identity]')!;
      const all = [...header.querySelectorAll('button,input,select,[role="menuitem"]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      const clippedFiles = all.filter(el => el.matches('input[type="file"].sr-only'));
      const controls = all.filter(el => !clippedFiles.includes(el));
      return { title: name.getBoundingClientRect().width, header: header.getBoundingClientRect().height,
        clippedFiles: clippedFiles.map(el => ({ tag: el.tagName, type: el.getAttribute('type'), className: el.className, clipPath: getComputedStyle(el).clipPath, clip: getComputedStyle(el).clip, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, name: el.getAttribute('aria-label') })),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        targets: controls.map(el => ({ hit: el.contains(document.elementFromPoint(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2, el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)), height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, name: el.getAttribute("aria-label") || el.textContent })) };
    });
    await test.info().attach('header-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    for (const input of geometry.clippedFiles) {
      expect(input.type).toBe('file'); expect(input.width).toBe(1); expect(input.height).toBe(32);
      expect(input.clipPath).toBe('inset(50%)');
    }
    expect(geometry.title).toBeGreaterThan(0); expect(geometry.header).toBe(48);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.targets.length).toBeGreaterThan(3); for (const target of geometry.targets) { expect(target.hit, target.name || "header control").toBe(true); expect(target.height, target.name || "header control").toBeGreaterThanOrEqual(32); expect(target.width, target.name || "header control").toBeGreaterThanOrEqual(32); expect(target.left).toBeGreaterThanOrEqual(276); expect(target.right, target.name || "header control").toBeLessThanOrEqual(width); }
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
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
    const before = await savedNative(page, 'word', original.id), url = page.url();
    const paragraph = page.locator('.w-paragraph').last(), node = await paragraph.elementHandle();
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
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(page.locator('[data-document-context]')).toContainText('Customer adoption — delivery review');
  await expect.poll(async () => (await visibleBoxes(page, '.sl-text-frame')).length).toBeGreaterThan(0);
  const [title] = await visibleBoxes(page, '.sl-text-frame');
  await page.mouse.click(title.x, title.y);
  const native = () => page.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const geometry = () => page.locator('.sl-stage,.sl-overlay').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, transform: getComputedStyle(el).transform }; }));
  const before = await native(), stage = await geometry();
  const header = page.locator('.sl-topbar'), navigation = header.getByRole('button', { name: '레이어', exact: true }), inspector = header.getByRole('button', { name: '속성', exact: true });
  await navigation.click(); await expect(page.locator('#slides-objects')).toBeVisible();
  await inspector.click(); await expect(page.locator('#slides-objects')).toBeHidden();
  const width = page.locator('#slides-details').getByRole('spinbutton', { name: '너비', exact: true });
  const initial = await width.inputValue(); await width.fill('99');
  await inspector.click(); await expect(page.locator('#slides-details')).toBeHidden(); await expect(page.locator('#slides-objects')).toBeVisible();
  const hit = await page.evaluate(({ x, y }) => { const element = document.elementFromPoint(x, y); return { html: element?.outerHTML, nativeCanvas: !!element?.closest('.sl-overlay') }; }, title);
  await test.info().attach('selected-content-point', { body: JSON.stringify(hit), contentType: 'application/json' });
  expect(hit.nativeCanvas).toBe(true);
  await page.mouse.click(title.x, title.y);
  expect(await native()).toEqual(before);
  await inspector.click(); await expect(width).toHaveValue('99'); await width.press('Escape'); await expect(width).toHaveValue(initial);
  expect(await native()).toEqual(before); expect(await geometry()).toEqual(stage);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#slides-objects')).toBeVisible(); await expect(page.locator('#slides-details')).toBeVisible();
  expect(await native()).toEqual(before); await expect(width).toHaveValue(initial);
  await page.locator('#slides-objects button').first().focus();
  await page.setViewportSize({ width: 1170, height: 1000 });
  await expect(navigation).toBeFocused();
  await expect(page.locator('#slides-objects')).toBeHidden(); await expect(page.locator('#slides-details')).toBeVisible();
  expect(await native()).toEqual(before); await expect(width).toHaveValue(initial);
});

test('Word desktop panels retain the native selection and unsubmitted comment through resize', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = await populated(page, 'word'); await page.goto(original.url);
  await expect(page.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(fullTitle('word'));
  const paragraph = page.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Workspace review');
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.collapsed)).toBe(false);
  const native = () => page.evaluate(() => { const e = (window as any).editor; return { document: e.exportDocument(), history: e.getHistoryStats(), selection: e.selection }; });
  const before = await native();
  await page.locator('.w-comments-closed').click();
  const draft = page.getByRole('textbox', { name: 'New comment', exact: true });
  await draft.fill('Review this original, not a copy.');
  await page.setViewportSize({ width: 1170, height: 1000 }); await expect(draft).toBeHidden();
  const inspector = page.locator('[data-workspace-toggle="inspector"]');
  await inspector.click(); await expect(draft).toHaveValue('Review this original, not a copy.');
  expect(await native()).toEqual(before);
  await draft.press('Escape'); await expect(draft).toBeHidden(); await expect(inspector).toBeFocused();
  await inspector.press('Enter'); await expect(draft).toHaveValue('Review this original, not a copy.');
  await page.setViewportSize({ width: 1440, height: 1000 }); await expect(draft).toBeVisible();
  expect(await native()).toEqual(before); await expect(page.locator('.ow-file-navigation')).toBeVisible();
});
