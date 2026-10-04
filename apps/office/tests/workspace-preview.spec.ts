import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { nativeEditor, nativeFrame } from './helpers/native-editor';
import { openLocalLibrary } from './helpers/local-library';
import * as note from '../../../packages/office-note/src/workspace-adapter';
import * as word from '../../../packages/office-word/src/workspace-adapter';
import * as slides from '../../../packages/office-slides/src/workspace-adapter';
import * as site from '../../../packages/office-site/src/workspace-adapter';

const workspace = 'preview-workspace';
const originals = ([['note', 'barocss-note', note], ['word', 'barocss-word', word],
  ['slides', 'barocss-slides-workspace', slides], ['site', 'barocss-site-workspace', site]] as const)
  .map(([product, db, codec]) => ({ product, db, id: `preview-${product}`, text: codec.text(codec.create() as never) }));
async function seed(page: Page) {
  await page.goto('/');
  await openLocalLibrary(page);
  await page.evaluate(async ({ workspace, originals }) => {
    localStorage.setItem('wonffice.local-workspace', workspace);
    for (const original of originals) await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(original.db, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('documents', { keyPath: 'name' }); };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, transaction = db.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put({ name: original.id, title: `Built ${original.product}`, text: original.text, savedAt: 1, revision: 1 });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { workspace, originals });
}
async function expectOriginal(page: Page, original: typeof originals[number]) {
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect(nativeEditor(page).locator('#root')).toBeVisible();
  await expect(nativeEditor(page).locator('.office-editor-header')).toHaveCount(1);
  expect(await nativeEditor(page).locator('.office-document-bar').evaluate(element => element.getBoundingClientRect().height)).toBe(48);
  await expect(page.locator('iframe[data-local-native-frame="active"]')).not.toHaveAttribute('inert', '');
  await expect(page.locator(`[data-original="${original.product}:${original.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new URL(`/${workspace}/${original.id}`, page.url()).href);
}

test('built preview supports all four compact direct links and reloads without missing assets', async ({ page }) => {
  const assetFailures: string[] = [];
  page.on('requestfailed', request => { if (request.url().includes('/assets/')) assetFailures.push(request.url()); });
  page.on('response', response => { if (response.url().includes('/assets/') && response.status() >= 400) assetFailures.push(response.url()); });
  await seed(page);
  for (const original of originals) {
    await page.goto(`/${workspace}/${original.id}`); await expectOriginal(page, original);
    await page.reload(); await expectOriginal(page, original);
  }
  expect(assetFailures).toEqual([]);
});

for (const width of [1170, 1440]) for (const theme of ['light', 'dark'] as const) test(`built delayed CSS retains styled loading at ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await seed(page);
  await page.addInitScript(theme => {
    document.documentElement.dataset.theme = theme;
    const state = window as typeof window & { __routeLayoutShifts?: unknown[] };
    state.__routeLayoutShifts = [];
    new PerformanceObserver(list => {
      state.__routeLayoutShifts!.push(...list.getEntries().map(entry => entry.toJSON()));
    }).observe({ type: 'layout-shift', buffered: true });
  }, theme);
  const capture = async (name: string) => {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
  };
  const metrics = async (name: string, details: object = {}) => {
    const observed = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      headers: [...document.querySelectorAll('.office-document-bar, .office-entry-status > header')].map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
      navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
      resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
      layoutShifts: (window as typeof window & { __routeLayoutShifts?: unknown[] }).__routeLayoutShifts ?? [],
    }));
    const child = await nativeFrame(page);
    const native = await child.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      headers: [...document.querySelectorAll('.office-document-bar')].map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
      resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
    }));
    const path = info.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify({ width, theme, ...details, ...observed, native }, null, 2));
    await info.attach(name, { path, contentType: 'application/json' });
  };
  await page.emulateMedia({ colorScheme: theme });
  const assets = new URL('../dist/assets/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('../.vite/manifest.json', assets), 'utf8')) as Record<string, { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }>;
  const html = await readFile(new URL('../products/word/index.html', assets), 'utf8');
  const entry = manifest['products/word/index.html'];
  expect(html).toContain(entry.file);
  const seen = new Set<string>(), styles: string[] = [];
  const collect = (key: string) => {
    if (seen.has(key)) return; seen.add(key);
    const chunk = manifest[key]; expect(chunk).toBeDefined(); styles.push(...chunk.css ?? []);
    [...chunk.imports ?? [], ...chunk.dynamicImports ?? []].forEach(collect);
  };
  collect('products/word/index.html');
  const wordStyles: string[] = [];
  for (const name of new Set(styles)) if ((await readFile(new URL(`../${name}`, assets), 'utf8')).includes('.w-page')) wordStyles.push(name);
  expect(wordStyles).toHaveLength(1);
  const nativeStyle = wordStyles[0].slice('assets/'.length);
  let release!: () => void, requested!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), requestSeen = new Promise<void>(resolve => { requested = resolve; });
  await page.route(`**/assets/${nativeStyle}`, async route => { requested(); await held; await route.continue(); });
  try {
    await page.goto(`/${workspace}/preview-word`, { waitUntil: 'domcontentloaded' }); await requestSeen;
    const loading = page.locator('.ow-entry-status');
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toBeVisible();
    await expect(loading).toContainText('파일을 불러오는 중입니다.');
    const escape = loading.getByRole('link', { name: '자료함', exact: true });
    await expect(escape).toBeInViewport();
    await expect(escape).toHaveAttribute('href', `/${workspace}?view=library`);
    const bounds = await loading.evaluate(element => {
      const rect = element.getBoundingClientRect(), slot = element.parentElement!.getBoundingClientRect();
      const box = (value: DOMRect) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
      return { overlay: box(rect), slot: box(slot), background: getComputedStyle(element).backgroundColor, font: getComputedStyle(element).fontFamily };
    });
    expect(bounds.overlay).toEqual(bounds.slot);
    expect(bounds.overlay.height).toBe(900);
    expect(bounds.background).not.toBe('rgba(0, 0, 0, 0)'); expect(bounds.font).toContain('system-ui');
    // The isolated child must not install or expose its native body while CSS is held.
    await expect(page.locator('iframe[data-local-native-frame="active"]')).toHaveAttribute('inert', '');
    await expect(nativeEditor(page).locator('.w-page')).toHaveCount(0);
    await metrics('loading-style-metrics', { ...bounds, condition: 'Word native CSS response held; browser routing disables HTTP cache' });
    await capture('styled-loading');
    release(); await expectOriginal(page, originals[1]);
    await metrics('installed-original-metrics');
    await capture('installed-original');
    await page.unrouteAll({ behavior: 'wait' });
    await page.reload(); await expectOriginal(page, originals[1]);
    await metrics('reload-resource-timing', { condition: 'Reload after held-response release; resource timings recorded, cache hit not assumed' });
    await capture('reload');
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
