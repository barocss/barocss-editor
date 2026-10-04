import { expect, test, type Page } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
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
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
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
  await expect(page.locator('.ow-native-slot > #root')).toBeVisible();
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
    const path = info.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify({ width, theme, ...details, ...observed }, null, 2));
    await info.attach(name, { path, contentType: 'application/json' });
  };
  await page.emulateMedia({ colorScheme: theme });
  const assets = new URL('../dist/assets/', import.meta.url);
  const styles = await readdir(assets);
  const nativeStyle = styles.find(name => name.startsWith('main-') && name.endsWith('.css'));
  expect(nativeStyle).toBeDefined();
  expect(await readFile(new URL(nativeStyle!, assets), 'utf8')).toContain('.w-page');
  let release!: () => void, requested!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), requestSeen = new Promise<void>(resolve => { requested = resolve; });
  await page.route(`**/assets/${nativeStyle}`, async route => { requested(); await held; await route.continue(); });
  try {
    await page.goto(`/${workspace}/preview-word`, { waitUntil: 'domcontentloaded' }); await requestSeen;
    await expect(page.locator('[data-entry-state="loading"]')).toBeVisible();
    const bounds = await page.locator('.office-entry-status > header').evaluate(element => ({ height: element.getBoundingClientRect().height,
      background: getComputedStyle(element).backgroundColor, font: getComputedStyle(element).fontFamily }));
    expect(bounds.height).toBe(48); expect(bounds.background).not.toBe('rgba(0, 0, 0, 0)'); expect(bounds.font).toContain('system-ui');
    await expect(page.locator('.ow-native-slot > #root')).toHaveCount(0);
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
