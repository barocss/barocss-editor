import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import * as note from '../../../packages/office-note/src/workspace-adapter';
import * as word from '../../../packages/office-word/src/workspace-adapter';
import * as slides from '../../../packages/office-slides/src/workspace-adapter';
import * as site from '../../../packages/office-site/src/workspace-adapter';

type Node = { stype: string; text?: string; attributes?: Record<string, unknown>; content?: Node[] };
const originals = ([['note', 'barocss-note', note], ['word', 'barocss-word', word],
  ['slides', 'barocss-slides-workspace', slides], ['site', 'barocss-site-workspace', site]] as const).flatMap(([product, db, codec]) => [false, true].map(longPanel => {
  const native = codec.create() as unknown as Node, title = longPanel ? `Wonffice original ${product} — workspace research and delivery review with a long document title` : `Original ${product}`, marker = `Fictional ${product} content`;
  const fill = (node: Node, parent = '') => {
    if (node.stype === 'inline-text') node.text = parent === 'docTitle' ? title : marker;
    node.content?.forEach(child => fill(child, node.stype));
  };
  fill(native); if (product === 'note') native.attributes = { ...native.attributes, title };
  return { product, db, id: `header-${product}${longPanel ? '-long' : ''}`, title, marker, longPanel, text: codec.text(native as never) };
}));

// Fictional local originals. This is desktop native/chrome evidence, not server or two-user alpha.
for (const original of originals) for (const width of [1170, 1280, 1440]) for (const theme of ['light', 'dark'] as const) {
  test(`${original.product} one populated header at ${width} ${theme}${original.longPanel ? ' long title and panel' : ''}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
    await page.evaluate(async originals => {
      localStorage.setItem('wonffice.local-workspace', 'header-workspace');
      for (const original of originals) await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(original.db, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('documents', { keyPath: 'name' });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, transaction = db.transaction('documents', 'readwrite');
          transaction.objectStore('documents').put({ name: original.id, title: original.title, text: original.text, savedAt: 1, revision: 1 });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    }, originals);
    await page.goto(`/header-workspace/${original.id}`);
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(page.locator('.ow-file-navigation')).toBeVisible();
    await expect(page.locator(`.ow-file-navigation [data-original="${original.product}:${original.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    const frameElement = page.locator('.ow-native-slot iframe[data-local-native-frame="active"]');
    await expect(frameElement).toHaveCount(1);
    await expect(frameElement).toHaveAttribute('title', `${original.product} native editor`);
    await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
    const frameHandle = (await frameElement.elementHandle())!;
    const native = (await frameHandle.contentFrame())!;
    expect(native, 'the active editor has a child document').not.toBeNull();
    const header = native.locator('.office-editor-header');
    await expect(header).toHaveCount(1);
    if (original.product === 'word') await expect(header.getByRole('textbox', { name: '문서 제목', exact: true })).toHaveValue(original.title);
    else await expect(header.locator('[data-document-identity]')).toContainText(original.title);
    await expect(native.locator('#root')).toContainText(original.marker);
    const nativeRoot = (await native.locator('#root').elementHandle())!;
    if (original.longPanel) {
      if (original.product === 'word' || original.product === 'slides' || original.product === 'site') {
        await header.getByRole('menuitem', { name: original.product === 'word' ? '문서 패널' : '패널', exact: true }).click();
        await native.getByRole('menuitemcheckbox', { name: original.product === 'word' ? '댓글' : original.product === 'slides' ? '속성 · 크기, 위치, 모양' : '자세한 속성', exact: true }).click();
      } else {
        const trigger = header.getByRole('button', { name: '노트 페이지 관리', exact: true });
        if (await trigger.getAttribute('aria-pressed') !== 'true') await trigger.click();
      }
      await expect(native.locator(`[data-workspace-panel="${original.product === 'note' ? 'navigation' : 'inspector'}"]`)).toBeVisible();
    }
    const geometry = await native.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.office-editor-header')!, box = header.getBoundingClientRect();
      const controls = [...header.querySelectorAll<HTMLElement>('button,input:not([hidden]),select')].filter(node => !node.closest('[hidden]') && node.getBoundingClientRect().height > 0).map(node => {
        const b = node.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { name: node.getAttribute('aria-label') ?? node.textContent ?? node.tagName, width: b.width, height: b.height, centerY: b.y + b.height / 2, hit: !!hit && (hit === node || node.contains(hit)), left: b.left, right: b.right };
      });
      const body = document.querySelector<HTMLElement>('.nw-workspace,.w-shell-body,.sl-body,.st-body')!;
      return { header: { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }, bodyTop: body.getBoundingClientRect().top, controls,
        contextRows: header.querySelectorAll('[data-document-context]').length,
        permanentStrips: [...document.querySelectorAll<HTMLElement>('.w-view-utilities,.sl-utilities,.st-utilities')].filter(node => node.getBoundingClientRect().height > 0).length };
    });
    // Header/control hit tests use the child viewport. The frame itself must fill the
    // host's editing slot, whose coordinates are in the parent viewport.
    const frameBox = (await frameElement.boundingBox())!, slotBox = (await page.locator('.ow-native-slot').boundingBox())!;
    const childViewport = await native.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(frameBox.x).toBeCloseTo(slotBox.x, 0);
    expect(frameBox.y).toBeCloseTo(slotBox.y, 0);
    expect(frameBox.width).toBeCloseTo(slotBox.width, 0);
    expect(frameBox.height).toBeCloseTo(slotBox.height, 0);
    expect(geometry.header.x).toBe(0);
    expect(geometry.header.y).toBe(0);
    expect(geometry.header.width).toBe(childViewport.width);
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ ...geometry, frame: frameBox, slot: slotBox, childViewport }, null, 2));
    await page.screenshot({ path: info.outputPath('populated-native.png'), animations: 'disabled' });
    expect(geometry.header.height).toBe(48);
    expect(geometry.bodyTop).toBeGreaterThanOrEqual(geometry.header.bottom - 1);
    expect(geometry.bodyTop).toBeLessThanOrEqual(geometry.header.bottom + 1);
    expect(geometry.contextRows).toBe(0);
    expect(geometry.permanentStrips).toBe(0);
    expect(geometry.controls.length).toBeGreaterThan(1);
    for (const control of geometry.controls) {
      expect(control.height, control.name).toBeGreaterThanOrEqual(32);
      expect(control.width, control.name).toBeGreaterThanOrEqual(32);
      expect(control.hit, control.name).toBe(true);
      expect(Math.abs(control.centerY - (geometry.header.y + 24)), control.name).toBeLessThanOrEqual(1);
      expect(control.left, control.name).toBeGreaterThanOrEqual(geometry.header.x);
      expect(control.right, control.name).toBeLessThanOrEqual(geometry.header.x + geometry.header.width);
    }
    const menu = header.getByRole('menuitem', { name: original.product === 'note' ? '노트 메뉴' : '문서 메뉴', exact: true });
    await menu.focus(); await page.keyboard.press('Enter');
    const documentMenu = native.getByRole('menu', { name: original.product === 'note' ? '노트 메뉴' : '문서 메뉴', exact: true });
    await expect(documentMenu).toBeVisible();
    const commands = documentMenu.locator('button[role="menuitem"]:not(:disabled),button[role="menuitemcheckbox"]:not(:disabled)');
    await page.keyboard.press('Home'); await expect(commands.first()).toBeFocused();
    await page.keyboard.press('End'); await expect(commands.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    if (original.product === 'site') {
      const panels = header.getByRole('menuitem', { name: '패널', exact: true });
      await panels.click();
      await native.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true }).click();
      const tools = native.locator('.st-all-tools-popup');
      await expect(tools).toBeVisible();
      const toolbar = tools.locator('.office-ribbon-toolbar');
      await expect(toolbar).toBeVisible();
      const layout = await toolbar.evaluate(node => ({ height: node.getBoundingClientRect().height, wrap: getComputedStyle(node).flexWrap }));
      const popupBox = (await tools.boundingBox())!, editorBox = (await page.locator('.ow-native-slot').boundingBox())!;
      expect(popupBox.x).toBeGreaterThanOrEqual(editorBox.x);
      expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
      expect(popupBox.width).toBeLessThanOrEqual(640);
      expect(layout.wrap).toBe('wrap');
      expect(layout.height).toBeGreaterThan(36);
      await page.screenshot({ path: info.outputPath('site-native-tools.png'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await expect(tools).toBeHidden();
      await expect(panels).toBeFocused();
      await expect(header).toHaveCSS('height', '48px');
      // A checked menu item closes its owned popup once; it must not outside-dismiss then reopen.
      await panels.click(); await native.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true }).click();
      await expect(tools).toBeVisible();
      await panels.click(); await native.getByRole('menuitemcheckbox', { name: '전체 도구', exact: true }).click();
      await expect(tools).toBeHidden();
    }
    expect(await nativeRoot.evaluate(node => node.isConnected)).toBe(true);
    expect(await frameHandle.evaluate(node => node.isConnected)).toBe(true);
    expect(await frameHandle.contentFrame()).toBe(native);
    await expect(page).toHaveURL(new URL(`/header-workspace/${original.id}`, page.url()).href);
  });
}
